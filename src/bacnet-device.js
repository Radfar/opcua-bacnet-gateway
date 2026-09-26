const Bacnet = require('node-bacnet');
const { mockBACnetDatabase, DEVICE_INSTANCE } = require('./device-object');

const DEVICE_VENDOR_ID = 999;

const client = new Bacnet({ port: 47808, interface: '0.0.0.0' });

console.log('BACnet/IP Native Client-Server Stack Initialized');
console.log(`Exposing Device Instance: ${DEVICE_INSTANCE} on UDP Port 47808`);

// --- Discovery (documented, already working) ---
client.on('whoIs', (data) => {
  console.log(`[Discovery] Who-Is request caught from: ${data.header.sender.address}`);
  client.iAmResponse(data.header.sender, DEVICE_INSTANCE, Bacnet.enum.Segmentation.NO_SEGMENTATION, DEVICE_VENDOR_ID);
});

// --- ReadProperty: confirmed real event name is "readProperty" (not "request") ---
client.on('readProperty', (data) => {
  const { objectId, property } = data.payload; // {type, instance}, {id, index}
  console.log(`[ReadProperty] type=${objectId.type} instance=${objectId.instance} prop=${property.id}`);

  const objType = mockBACnetDatabase[objectId.type];
  const obj = objType ? objType[objectId.instance] : null;
  const value = obj ? obj[property.id] : null;

  if (value) {
    // readPropertyResponse needs the WHOLE property object ({id, index}), not just property.id
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

// --- WriteProperty: same fix, real event is "writeProperty" ---
client.on('writeProperty', (data) => {
  const { objectId, property, value } = data.payload; // value is an array of tagged values, e.g. [{type, value}]
  console.log(`[WriteProperty] type=${objectId.type} instance=${objectId.instance} prop=${property.id}`);

  const objType = mockBACnetDatabase[objectId.type];
  const obj = objType ? objType[objectId.instance] : null;

  if (obj && obj[property.id] && value && value.length) {
    obj[property.id] = value; // store as-is (already tagged) so future reads stay consistent
    console.log(`  -> new value: ${JSON.stringify(value[0].value)}`);
    // simpleAckResponse's 2nd arg is the SERVICE ENUM, not anything off the request
    client.simpleAckResponse(data.header.sender, Bacnet.enum.ConfirmedServiceChoice.WRITE_PROPERTY, data.invokeId);
    // TODO once this is proven stable: push this write back into your OPC UA client
    // so a BACnet-side write actually reaches CODESYS, not just this mock store.
  } else {
    client.errorResponse(
      data.header.sender,
      data.invokeId,
      Bacnet.enum.ErrorClass.PROPERTY,
      Bacnet.enum.ErrorCode.UNKNOWN_PROPERTY
    );
  }
});

// --- Mock telemetry loop: stand-in for the eventual OPC UA poll ---
setInterval(() => {
  const ai1 = mockBACnetDatabase[Bacnet.enum.ObjectType.ANALOG_INPUT][1];
  const presentValue = ai1[Bacnet.enum.PropertyIdentifier.PRESENT_VALUE][0];
  presentValue.value = parseFloat((presentValue.value + (Math.random() - 0.4)).toFixed(2));
  console.log(`[Mock Telemetry] AI_1 -> ${presentValue.value}`);
}, 3000);