require('dotenv').config();
const Bacnet = require('node-bacnet');
const { mockBACnetDatabase, DEVICE_INSTANCE } = require('./device-object');
const { startOpcua, writeTag, zone3 } = require('./opcua-client');
const historian = require('./historian');
// --- COV (Change-of-Value) subscriptions ---
const covSubscriptions = new Map(); // key: "type-instance" -> array of subscriber objects
const lastSyncedValues = {};        // key: "type-instance" -> last raw value, for change detection

const DEVICE_VENDOR_ID = 999;

const client = new Bacnet({ port: 47808, interface: '0.0.0.0' });
let autoHoldUntil = 0; // after a BACnet write, ignore the polled AUTO value briefly (the OPC UA poll lags the write)

console.log('BACnet/IP Native Client-Server Stack Initialized');
console.log(`Exposing Device Instance: ${DEVICE_INSTANCE} on UDP Port 47808`);

function resolvePriorityArray(obj) {
  const array = obj[Bacnet.enum.PropertyIdentifier.PRIORITY_ARRAY];
  for (let i = 0; i < 16; i++) {
    if (array[i].type !== Bacnet.enum.ApplicationTag.NULL) {
      return { value: array[i], priority: i + 1 };
    }
  }
  const def = obj[Bacnet.enum.PropertyIdentifier.RELINQUISH_DEFAULT][0];
  return { value: def, priority: null }; // null = running on Relinquish_Default, no active commander
}


// --- Discovery ---
client.on('whoIs', (data) => {
  console.log(`[Discovery] Who-Is request caught from: ${data.header.sender.address}`);
  client.iAmResponse(data.header.sender, DEVICE_INSTANCE, Bacnet.enum.Segmentation.NO_SEGMENTATION, DEVICE_VENDOR_ID);
});

// --- ReadProperty ---
client.on('readProperty', (data) => {
  const { objectId, property } = data.payload;
  console.log(`[ReadProperty] type=${objectId.type} instance=${objectId.instance} prop=${property.id}`);

  const objType = mockBACnetDatabase[objectId.type];
  const obj = objType ? objType[objectId.instance] : null;
  const value = obj ? obj[property.id] : null;

  if (value) {
    client.readPropertyResponse(data.header.sender, data.invokeId, objectId, property, value);
  } else {
    client.errorResponse(
      data.header.sender,
      Bacnet.enum.ConfirmedServiceChoice.READ_PROPERTY,
      data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY,
      Bacnet.enum.ErrorCode.UNKNOWN_PROPERTY
    );
  }
});

// --- WriteProperty: only Zone3_Auto (Binary Output 1) is genuinely writable — ---
// --- it's the only point wired back to OPC UA. Everything else is a read-only ---
// --- sensor mirror and correctly rejects writes, same as a real BACnet device. ---
// --- Zone3_Auto itself uses a real BACnet Priority_Array (16 levels) rather ---
// --- than a flat overwrite — see resolvePriorityArray(). ---
client.on('writeProperty', async (data) => {
  const { objectId, value: writeData } = data.payload;



  const { property, value, priority } = writeData; // priority sits alongside property/value, not inside property
  console.log(`[WriteProperty] type=${objectId.type} instance=${objectId.instance} prop=${property.id}`);

  const isAutoPoint =
  objectId.type === Bacnet.enum.ObjectType.BINARY_OUTPUT &&
  objectId.instance === 1 &&
  property.id === Bacnet.enum.PropertyIdentifier.PRESENT_VALUE;

  // Reject FIRST, before touching any object state — nothing below this point
  // should execute for a non-Auto write.
  if (!isAutoPoint || !value || !value.length) {
    console.log(`[WriteProperty] REJECTED: type=${objectId.type} instance=${objectId.instance} is not a commandable point`);
    client.errorResponse(
      data.header.sender,
      Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY,
      data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY,
      Bacnet.enum.ErrorCode.WRITE_ACCESS_DENIED
    );
    return;
  }

  const bo = mockBACnetDatabase[Bacnet.enum.ObjectType.BINARY_OUTPUT][1];
  const writePriority = priority || 16; // now reads the real decoded value
  if (writePriority < 1 || writePriority > 16) {  
    client.errorResponse(
      data.header.sender, Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY, data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY, Bacnet.enum.ErrorCode.VALUE_OUT_OF_RANGE
    );
    return;
  }

  const slot = bo[Bacnet.enum.PropertyIdentifier.PRIORITY_ARRAY];
  const isRelinquish = value[0].type === Bacnet.enum.ApplicationTag.NULL;
  slot[priority - 1] = isRelinquish
    ? { type: Bacnet.enum.ApplicationTag.NULL, value: null }
    : { type: value[0].type, value: value[0].value };

  const resolved = resolvePriorityArray(bo);
  const resolvedBool = !!resolved.value.value;
  const previousBool = !!bo[Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value;

  console.log(`[WriteProperty] Z03_AUTO priority=${priority} ${isRelinquish ? 'RELINQUISH' : 'value=' + resolvedBool} -> resolved=${resolvedBool} (winning priority: ${resolved.priority ?? 'default'})`);

  try {
    if (resolvedBool !== previousBool) {
      await writeTag('Z03_AUTO', resolvedBool);
      autoHoldUntil = Date.now() + 3000;
      bo[Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = resolvedBool ? 1 : 0;
      historian.logValue('Z03_AUTO', resolvedBool ? 1 : 0).catch(err => console.error('[Historian] AUTO log failed:', err.message));
      checkAndNotifyCov({ type: Bacnet.enum.ObjectType.BINARY_OUTPUT, instance: 1 }, resolvedBool ? 1 : 0);
    }
    client.simpleAckResponse(data.header.sender, Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY, data.invokeId);
  } catch (err) {
    console.error('  -> OPC UA write failed:', err.message);
    client.errorResponse(
      data.header.sender, Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY, data.invokeId,
      Bacnet.enum.ErrorClass.DEVICE, Bacnet.enum.ErrorCode.OPERATIONAL_PROBLEM
    );
  }
});

client.on('subscribeCov', (data) => {
  const { subscriberProcessId, monitoredObjectId, cancellationRequest, issueConfirmedNotifications, lifetime } = data.payload;
  const key = `${monitoredObjectId.type}-${monitoredObjectId.instance}`;
  console.log(`[SubscribeCOV] subscriber=${subscriberProcessId} object=${key} cancel=${cancellationRequest}`);

  if (cancellationRequest) {
    const subs = covSubscriptions.get(key) || [];
    covSubscriptions.set(key, subs.filter(s => s.subscriberProcessId !== subscriberProcessId));
    client.simpleAckResponse(data.header.sender, Bacnet.enum.ConfirmedServiceChoice.SUBSCRIBE_COV, data.invokeId);
    return;
  }

  const objType = mockBACnetDatabase[monitoredObjectId.type];
  const obj = objType ? objType[monitoredObjectId.instance] : null;
  if (!obj) {
    client.errorResponse(
      data.header.sender,
      Bacnet.enum.ConfirmedServiceChoice.SUBSCRIBE_COV,
      data.invokeId,
      Bacnet.enum.ErrorClass.OBJECT,
      Bacnet.enum.ErrorCode.UNKNOWN_OBJECT
    );
    return;
  }

  const subs = covSubscriptions.get(key) || [];
  const existing = subs.find(s => s.subscriberProcessId === subscriberProcessId);
  const subscription = {
    subscriberProcessId,
    receiver: data.header.sender,
    issueConfirmedNotifications,
    expiresAt: Date.now() + lifetime * 1000,
  };
  if (existing) Object.assign(existing, subscription);
  else subs.push(subscription);
  covSubscriptions.set(key, subs);

  client.simpleAckResponse(data.header.sender, Bacnet.enum.ConfirmedServiceChoice.SUBSCRIBE_COV, data.invokeId);

  // BACnet spec requires one notification immediately upon successful subscription
  sendCovNotification(monitoredObjectId, [subscription]);
});

// --- Push live Zone 03 OPC UA values into the BACnet object store, and log to historian ---
function syncFromOpcua() {
  if (!zone3.connected) return;

  const ai = mockBACnetDatabase[Bacnet.enum.ObjectType.ANALOG_INPUT];
  const bv = mockBACnetDatabase[Bacnet.enum.ObjectType.BINARY_VALUE];
  const bo = mockBACnetDatabase[Bacnet.enum.ObjectType.BINARY_OUTPUT];

    if (zone3.FLOW !== null) {
    ai[1][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.FLOW;
    checkAndNotifyCov({ type: Bacnet.enum.ObjectType.ANALOG_INPUT, instance: 1 }, zone3.FLOW);
  }
  if (zone3.MOISTURE !== null) {
    ai[2][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.MOISTURE;
    checkAndNotifyCov({ type: Bacnet.enum.ObjectType.ANALOG_INPUT, instance: 2 }, zone3.MOISTURE);
  }
  if (zone3.VALVE !== null) {
    bv[1][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.VALVE ? 1 : 0;
    checkAndNotifyCov({ type: Bacnet.enum.ObjectType.BINARY_VALUE, instance: 1 }, zone3.VALVE ? 1 : 0);
  }
  if (zone3.FAULT !== null) {
    bv[2][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.FAULT ? 1 : 0;
    checkAndNotifyCov({ type: Bacnet.enum.ObjectType.BINARY_VALUE, instance: 2 }, zone3.FAULT ? 1 : 0);
  }
  if (zone3.AUTO !== null && Date.now() > autoHoldUntil) {
    bo[1][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.AUTO ? 1 : 0;
    checkAndNotifyCov({ type: Bacnet.enum.ObjectType.BINARY_OUTPUT, instance: 1 }, zone3.AUTO ? 1 : 0);
  }
  console.log(`[Zone 03 -> BACnet] flow=${zone3.FLOW} moisture=${zone3.MOISTURE?.toFixed(2)} valve=${zone3.VALVE} fault=${zone3.FAULT} auto=${zone3.AUTO}`);
  // Fire-and-forget: don't block the sync loop on DB writes, but don't lose errors either
  logToHistorian().catch(err => console.error('[Historian] log failed:', err.message));
}

async function logToHistorian() {
  if (zone3.FLOW !== null) await historian.logValue('Z03_FLOW', zone3.FLOW);
  if (zone3.MOISTURE !== null) await historian.logValue('Z03_MOISTURE', zone3.MOISTURE);
  if (zone3.VALVE !== null) await historian.logValue('Z03_VALVE', zone3.VALVE ? 1 : 0);
  if (zone3.FAULT !== null) await historian.logValue('Z03_FAULT', zone3.FAULT ? 1 : 0);
}

setInterval(syncFromOpcua, 1000);

// Initialize historian tag cache before starting OPC UA
historian.initHistorian()
  .then(() => startOpcua().catch(err => console.error('Failed to start OPC UA client:', err.message)))
  .catch(err => console.error('Failed to initialize historian:', err.message));

function sendCovNotification(objectId, subscribers) {
  const objType = mockBACnetDatabase[objectId.type];
  const obj = objType ? objType[objectId.instance] : null;
  if (!obj) return;

  const presentValue = obj[Bacnet.enum.PropertyIdentifier.PRESENT_VALUE];
  const values = [{ property: { id: Bacnet.enum.PropertyIdentifier.PRESENT_VALUE }, value: presentValue }];

  for (const sub of subscribers) {
    const remaining = Math.max(0, Math.round((sub.expiresAt - Date.now()) / 1000));
    if (sub.issueConfirmedNotifications) {
      client.confirmedCOVNotification(
        sub.receiver, objectId, sub.subscriberProcessId, DEVICE_INSTANCE, remaining, values,
        (err) => { if (err) console.error('[COV] confirmed notify failed:', err.message); }
      );
    } else {
      client.unconfirmedCOVNotification(sub.receiver.address, sub.subscriberProcessId, DEVICE_INSTANCE, objectId, remaining, values);
    }
  }
  console.log(`[COV] Notified ${subscribers.length} subscriber(s) for ${objectId.type}-${objectId.instance}`);
}

function checkAndNotifyCov(objectId, newRawValue) {
  const key = `${objectId.type}-${objectId.instance}`;
  if (lastSyncedValues[key] === newRawValue) return;
  lastSyncedValues[key] = newRawValue;

  const subs = (covSubscriptions.get(key) || []).filter(s => s.expiresAt > Date.now());
  covSubscriptions.set(key, subs);
  if (subs.length > 0) sendCovNotification(objectId, subs);
}