/**
 * bacnetGateway.js
 *
 * Prototype OPC UA -> BACnet bridge for the irrigation testbed.
 * Reuses the same polling pattern as server/opcua.js (already working for Zone 03)
 * and exposes the values as BACnet objects using `node-bacnet` (npm i node-bacnet).
 *
 * IMPORTANT — read before you build on this:
 * node-bacnet's own docs (biancoroyal.github.io/node-bacstack) list only
 * `iAm`, `whoIs`, `timeSync`, `error` as documented events on the client/device
 * instance. The server-side "respond to ReadProperty/WriteProperty" behavior
 * is marked Beta — untested, undocumented, breaking interface — in their own
 * feature table. That means:
 *   1. The `readProperty` / `writeProperty` listener signatures below are my
 *      best-effort reconstruction from the library's general event pattern
 *      (`client.on(event, (address, request, next) => ...)`), NOT confirmed
 *      against a documented API.
 *   2. Before you rely on this for anything real, open
 *      node_modules/node-bacnet/test/ after installing it and check how the
 *      test suite actually triggers/handles these two events, and adjust the
 *      handler signatures/response calls to match.
 *   3. If the Beta server support turns out too unreliable, this is exactly
 *      the fallback point where the C# + CAS BACnet Stack SDK plan comes back
 *      in — same object model below, different transport implementation.
 */

const Bacnet = require('node-bacnet');
const { getZoneValues } = require('./opcua'); // reuse your existing OPC UA polling — adjust export name to match server/opcua.js

const DEVICE_INSTANCE = 389001; // pick any unused BACnet device instance for this gateway
const POLL_MS = 1000;

// In-memory object store: BACnet objectId -> current value + metadata
// Object type numbers (BACnet standard): Analog Input = 0, Binary Input = 3, Binary Output = 4
const objectStore = new Map([
  ['AI:1', { type: 0, instance: 1, name: 'Zone3_Flow', value: 0, units: 'gallons-per-minute' }],
  ['AI:2', { type: 0, instance: 2, name: 'Zone3_Moisture', value: 0, units: 'percent' }],
  ['BO:1', { type: 4, instance: 1, name: 'Zone3_Valve', value: 0 }],   // 0=inactive,1=active
  ['BI:1', { type: 3, instance: 1, name: 'Zone3_Fault', value: 0 }],
]);

const client = new Bacnet({ apduTimeout: 6000 });

// --- Documented: respond to discovery so Ignition/other BACnet clients can find this device ---
client.on('whoIs', (data) => {
  client.iAmResponse(data.address, DEVICE_INSTANCE, Bacnet.enum.Segmentation.SEGMENTED_BOTH, 40);
});

// --- Undocumented/Beta: server-side ReadProperty handling — verify signature against library source ---
client.on('readProperty', (data) => {
  const key = `${objTypeLabel(data.request.objectId.type)}:${data.request.objectId.instance}`;
  const obj = objectStore.get(key);
  if (!obj) return; // let it time out / return not-found per library default

  if (data.request.property.id === Bacnet.enum.PropertyIdentifier.PRESENT_VALUE) {
    client.readPropertyResponse(data.address, data.invokeId, data.request.objectId, data.request.property, [
      { type: Bacnet.enum.ApplicationTags.REAL, value: obj.value },
    ]);
  }
});

// --- Undocumented/Beta: server-side WriteProperty handling — verify signature against library source ---
client.on('writeProperty', (data) => {
  const key = `${objTypeLabel(data.request.objectId.type)}:${data.request.objectId.instance}`;
  const obj = objectStore.get(key);
  if (!obj) return;

  if (data.request.property.id === Bacnet.enum.PropertyIdentifier.PRESENT_VALUE) {
    obj.value = data.request.value[0].value;
    console.log(`BACnet write: ${obj.name} -> ${obj.value}`);
    // TODO: push this write back into OPC UA (client.write / your existing command endpoint)
    // so a BACnet-side start/stop actually reaches CODESYS, not just this in-memory store.
    client.simpleAckResponse(data.address, data.request.serviceChoice, data.invokeId);
  }
});

function objTypeLabel(type) {
  return { 0: 'AI', 3: 'BI', 4: 'BO' }[type] || 'UNKNOWN';
}

// --- Poll OPC UA (same pattern as server/opcua.js) and push values into the BACnet object store ---
setInterval(async () => {
  try {
    const zone3 = await getZoneValues(3); // { flow, moisture, valve, fault } — match to your actual shape
    objectStore.get('AI:1').value = zone3.flow;
    objectStore.get('AI:2').value = zone3.moisture;
    objectStore.get('BO:1').value = zone3.valve ? 1 : 0;
    objectStore.get('BI:1').value = zone3.fault ? 1 : 0;
  } catch (err) {
    console.error('OPC UA poll failed:', err.message);
  }
}, POLL_MS);

console.log(`BACnet gateway device ${DEVICE_INSTANCE} starting — Ctrl+C to stop`);
