const bacnet = require('node-bacnet');

const DEVICE_INSTANCE = 10003;

const objectList = [
  { type: bacnet.enum.ObjectType.DEVICE, instance: DEVICE_INSTANCE },
  { type: bacnet.enum.ObjectType.ANALOG_INPUT, instance: 1 },
  { type: bacnet.enum.ObjectType.ANALOG_INPUT, instance: 2 },
  { type: bacnet.enum.ObjectType.BINARY_VALUE, instance: 1 },
  { type: bacnet.enum.ObjectType.BINARY_VALUE, instance: 2 },
];

const mockBACnetDatabase = {
  [bacnet.enum.ObjectType.DEVICE]: {
    [DEVICE_INSTANCE]: {
      [bacnet.enum.PropertyIdentifier.OBJECT_NAME]: [{ value: 'OPCUA-BACnet-Gateway', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.OBJECT_IDENTIFIER]: [{ type: bacnet.enum.ApplicationTag.OBJECTIDENTIFIER, value: { type: bacnet.enum.ObjectType.DEVICE, instance: DEVICE_INSTANCE } }],
      [bacnet.enum.PropertyIdentifier.OBJECT_TYPE]: [{ value: bacnet.enum.ObjectType.DEVICE, type: bacnet.enum.ApplicationTag.ENUMERATED }],
      [bacnet.enum.PropertyIdentifier.VENDOR_IDENTIFIER]: [{ value: 999, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.VENDOR_NAME]: [{ value: 'Radfar Portfolio', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.MODEL_NAME]: [{ value: 'OPCUA-BACnet-Gateway', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.DESCRIPTION]: [{ value: 'OPC UA (CODESYS Zone 03) to BACnet gateway', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.FIRMWARE_REVISION]: [{ value: '0.1.0', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.APPLICATION_SOFTWARE_VERSION]: [{ value: '0.1.0', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.PROTOCOL_VERSION]: [{ value: 1, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.PROTOCOL_REVISION]: [{ value: 14, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.SYSTEM_STATUS]: [{ value: 0, type: bacnet.enum.ApplicationTag.ENUMERATED }],
      [bacnet.enum.PropertyIdentifier.MAX_APDU_LENGTH_ACCEPTED]: [{ value: 1476, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.SEGMENTATION_SUPPORTED]: [{ value: 3, type: bacnet.enum.ApplicationTag.ENUMERATED }],
      [bacnet.enum.PropertyIdentifier.APDU_TIMEOUT]: [{ value: 6000, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.NUMBER_OF_APDU_RETRIES]: [{ value: 3, type: bacnet.enum.ApplicationTag.UNSIGNED_INTEGER }],
      [bacnet.enum.PropertyIdentifier.OBJECT_LIST]: objectList.map((obj) => ({
        type: bacnet.enum.ApplicationTag.OBJECTIDENTIFIER,
        value: obj,
      })),
    },
  },
  [bacnet.enum.ObjectType.ANALOG_INPUT]: {
    1: {
      [bacnet.enum.PropertyIdentifier.OBJECT_NAME]: [{ value: 'Zone3_Flow', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.PRESENT_VALUE]: [{ value: 0, type: bacnet.enum.ApplicationTag.REAL }],
      [bacnet.enum.PropertyIdentifier.UNITS]: [{ value: 76, type: bacnet.enum.ApplicationTag.ENUMERATED }],
    },
    2: {
      [bacnet.enum.PropertyIdentifier.OBJECT_NAME]: [{ value: 'Zone3_Moisture', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.PRESENT_VALUE]: [{ value: 0, type: bacnet.enum.ApplicationTag.REAL }],
      [bacnet.enum.PropertyIdentifier.UNITS]: [{ value: 98, type: bacnet.enum.ApplicationTag.ENUMERATED }],
    },
  },
  [bacnet.enum.ObjectType.BINARY_VALUE]: {
    1: {
      [bacnet.enum.PropertyIdentifier.OBJECT_NAME]: [{ value: 'Zone3_Valve', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.PRESENT_VALUE]: [{ value: 0, type: bacnet.enum.ApplicationTag.ENUMERATED }],
    },
    2: {
      [bacnet.enum.PropertyIdentifier.OBJECT_NAME]: [{ value: 'Zone3_Fault', type: bacnet.enum.ApplicationTag.CHARACTER_STRING }],
      [bacnet.enum.PropertyIdentifier.PRESENT_VALUE]: [{ value: 0, type: bacnet.enum.ApplicationTag.ENUMERATED }],
    },
  },
};

module.exports = { mockBACnetDatabase, objectList, DEVICE_INSTANCE };