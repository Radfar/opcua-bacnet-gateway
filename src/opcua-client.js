const opcua = require('node-opcua-client');

const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  AttributeIds,
} = opcua;

const ENDPOINT = 'opc.tcp://127.0.0.1:4840';
const NS_URI = 'CODESYSSPV3/3S/IecVarAccess';
const GVL_PATH = '|var|CODESYS Control Win V3 x64.Application.GVL_SCADA';
const POLL_MS = 1000;

// Only these Zone 03 tags feed the BACnet objects right now (read-only).
// Confirmed live tag names from the working web-SCADA integration.
const WATCHED_TAGS = ['Z03_FLOW', 'Z03_MOISTURE', 'Z03_VALVE', 'Z03_FAULT'];

const zone3 = { connected: false, FLOW: null, MOISTURE: null, VALVE: null, FAULT: null };

let client = null;
let session = null;
let pollTimer = null;

/* Browse GVL_SCADA and return every variable inside it — same approach
   proven working in the web-SCADA project; robust to CODESYS project
   changes since it doesn't hardcode node IDs. */
async function discoverTags(ns) {
  const result = await session.browse({
    nodeId: `ns=${ns};s=${GVL_PATH}`,
    referenceTypeId: 'HierarchicalReferences',
    browseDirection: 0, // Forward
    includeSubtypes: true,
    nodeClassMask: 2, // Variable
    resultMask: 63,
  });

  return result.references.map((ref) => ({
    name: ref.browseName.name,
    nodeId: ref.nodeId.toString(),
  }));
}

async function startOpcua() {
  client = OPCUAClient.create({
    applicationName: 'OPCUA-BACnet-Gateway',
    applicationUri: 'urn:DESKTOP-TUFM4GA:OPCUA-BACnet-Gateway',
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,
    endpointMustExist: false,
  });

  await client.connect(ENDPOINT);
  session = await client.createSession({ type: UserTokenType.Anonymous });

  const ns = (await session.readNamespaceArray()).indexOf(NS_URI);
  if (ns < 0) throw new Error('CODESYS namespace not found');

  const allTags = await discoverTags(ns);
  const watched = allTags.filter((t) => WATCHED_TAGS.includes(t.name));

  if (watched.length !== WATCHED_TAGS.length) {
    const missing = WATCHED_TAGS.filter((name) => !watched.some((t) => t.name === name));
    throw new Error(`Missing expected Zone 03 tags in GVL_SCADA: ${missing.join(', ')}`);
  }

  console.log(`Watching: ${watched.map((t) => t.name).join(', ')}`);

  const nodes = watched.map((t) => ({ nodeId: t.nodeId, attributeId: AttributeIds.Value }));

  pollTimer = setInterval(async () => {
    try {
      const res = await session.read(nodes);
      watched.forEach((t, i) => {
        const good = res[i].statusCode.isGood();
        const value = good ? res[i].value.value : null;
        zone3[t.name.slice(4)] = value; // Z03_FLOW -> FLOW
      });
      zone3.connected = true;
    } catch (err) {
      zone3.connected = false;
      console.error('OPC UA read failed:', err.message);
    }
  }, POLL_MS);

  console.log('OPC UA connected, polling Zone 03');
}

async function stopOpcua() {
  try {
    if (pollTimer) clearInterval(pollTimer);
    if (session) await session.close();
    if (client) await client.disconnect();
    console.log('OPC UA session closed');
  } catch (err) {
    console.error('OPC UA shutdown error:', err.message);
  }
}

module.exports = { startOpcua, stopOpcua, zone3 };