const Bacnet = require('node-bacnet');
const { mockBACnetDatabase, DEVICE_INSTANCE } = require('./device-object');
const { startOpcua, zone3 } = require('./opcua-client');

const DEVICE_VENDOR_ID = 999;

const client = new Bacnet({ port: 47808, interface: '0.0.0.0' });

console.log('BACnet/IP Native Client-Server Stack Initialized');
console.log(`Exposing Device Instance: ${DEVICE_INSTANCE} on UDP Port 47808`);

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
      data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY,
      Bacnet.enum.ErrorCode.UNKNOWN_PROPERTY
    );
  }
});

// --- WriteProperty (not wired back to OPC UA yet — TODO once reads are proven stable) ---
client.on('writeProperty', (data) => {
  const { objectId, property, value } = data.payload;
  console.log(`[WriteProperty] type=${objectId.type} instance=${objectId.instance} prop=${property.id}`);

  const objType = mockBACnetDatabase[objectId.type];
  const obj = objType ? objType[objectId.instance] : null;

  if (obj && obj[property.id] && value && value.length) {
    obj[property.id] = value;
    console.log(`  -> new value: ${JSON.stringify(value[0].value)}`);
    client.simpleAckResponse(data.header.sender, Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY, data.invokeId);
    // TODO: push this write back into OPC UA via session.write(), same pattern as
    // the web-SCADA project's writeBool(), once reads are proven stable end-to-end.
  } else {
    client.errorResponse(
      data.header.sender,
      data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY,
      Bacnet.enum.ErrorCode.UNKNOWN_PROPERTY
    );
  }
});

// --- Push live Zone 03 OPC UA values into the BACnet object store ---
function syncFromOpcua() {
  if (!zone3.connected) return; // keep last-known-good values rather than overwriting with null

  const ai = mockBACnetDatabase[Bacnet.enum.ObjectType.ANALOG_INPUT];
  const bv = mockBACnetDatabase[Bacnet.enum.ObjectType.BINARY_VALUE];

  if (zone3.FLOW !== null) ai[1][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.FLOW;
  if (zone3.MOISTURE !== null) ai[2][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.MOISTURE;
  if (zone3.VALVE !== null) bv[1][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.VALVE ? 1 : 0;
  if (zone3.FAULT !== null) bv[2][Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0].value = zone3.FAULT ? 1 : 0;

  console.log(`[Zone 03 -> BACnet] flow=${zone3.FLOW} moisture=${zone3.MOISTURE} valve=${zone3.VALVE} fault=${zone3.FAULT}`);
}
setInterval(syncFromOpcua, 1000);

startOpcua().catch((err) => {
  console.error('Failed to start OPC UA client:', err.message);
});