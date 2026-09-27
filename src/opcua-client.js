const opcua = require('node-opcua-client');

const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  AttributeIds,
  DataType,
} = opcua;

const ENDPOINT = 'opc.tcp://127.0.0.1:4840';
const NS_URI = 'CODESYSSPV3/3S/IecVarAccess';
const GVL_PATH = '|var|CODESYS Control Win V3 x64.Application.GVL_SCADA';
const POLL_MS = 1000;

// Read side: these feed the BACnet objects every poll.
const WATCHED_TAGS = ['Z03_FLOW', 'Z03_MOISTURE', 'Z03_VALVE', 'Z03_FAULT'];

// Write side: only Auto/Manual mode is safely commandable from BACnet right now.
// Z03_VALVE/Z03_RUNNING are PLC-owned outputs — writing them would fight PLC logic.
const WRITABLE_TAGS = ['Z03_AUTO'];

const zone3 = { connected: false, FLOW: null, MOISTURE: null, VALVE: null, FAULT: null, AUTO: null };

let client = null;
let session = null;
let pollTimer = null;
const nodeIds = {}; // tag name -> node id string, populated on discovery

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
  const neededNames = [...WATCHED_TAGS, ...WRITABLE_TAGS];
  const needed = allTags.filter((t) => neededNames.includes(t.name));

  if (needed.length !== neededNames.length) {
    const missing = neededNames.filter((name) => !needed.some((t) => t.name === name));
    throw new Error(`Missing expected Zone 03 tags in GVL_SCADA: ${missing.join(', ')}`);
  }

  needed.forEach((t) => { nodeIds[t.name] = t.nodeId; });
  const watched = needed.filter((t) => WATCHED_TAGS.includes(t.name));

  console.log(`Watching: ${watched.map((t) => t.name).join(', ')}`);
  console.log(`Writable: ${WRITABLE_TAGS.join(', ')}`);

  // Poll the writable tag too, so zone3.AUTO reflects the current mode even before any write.
  const pollList = [...watched, ...needed.filter((t) => WRITABLE_TAGS.includes(t.name))];
  const nodes = pollList.map((t) => ({ nodeId: t.nodeId, attributeId: AttributeIds.Value }));

  pollTimer = setInterval(async () => {
    try {
      const res = await session.read(nodes);
      pollList.forEach((t, i) => {
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

async function writeTag(tagName, boolValue) {
  if (!WRITABLE_TAGS.includes(tagName)) {
    throw new Error(`${tagName} is not in WRITABLE_TAGS — refusing write`);
  }
  if (!session || !zone3.connected) {
    throw new Error('OPC UA not connected');
  }
  const status = await session.write({
    nodeId: nodeIds[tagName],
    attributeId: AttributeIds.Value,
    value: { value: { dataType: DataType.Boolean, value: boolValue } },
  });
  if (!status.isGood()) {
    throw new Error(`Write ${tagName} failed: ${status.toString()}`);
  }
  console.log(`[OPC UA write] ${tagName} -> ${boolValue}`);
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

module.exports = { startOpcua, stopOpcua, writeTag, zone3 };