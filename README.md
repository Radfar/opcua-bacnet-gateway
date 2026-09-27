# OPC UA → BACnet Gateway

A Node.js gateway that bridges live CODESYS PLC data (via OPC UA) into BACnet/IP — letting a BAS/BMS system (or any standard BACnet client) read real industrial process data without any native BACnet support on the PLC side.

## Why this exists

Most OT/IT integration work I do sits on the SCADA/IIoT side — Ignition, web-based SCADA, OPC UA, MQTT. BACnet/BAS is the one corner of the stack I hadn't built hands-on proof for. This project closes that gap: a real bridge, against real controller data, not a simulated example.

## Architecture

```
CODESYS (Zone 03 irrigation control)
   │  OPC UA (opc.tcp://127.0.0.1:4840)
   ▼
opcua-client.js   — browses GVL_SCADA, polls Zone 03 tags every 1s
   │
   ▼
bacnet-device.js  — in-memory BACnet object store, mirrors live values
   │  BACnet/IP (UDP 47808)
   ▼
Any BACnet client (Chipkin, YABE, a BAS front end, etc.)
```

Exposed objects: `Zone3_Flow` and `Zone3_Moisture` (Analog Input), `Zone3_Valve` and `Zone3_Fault` (Binary Value, read-only), `Zone3_Auto` (Binary Output, writable — Auto/Manual mode) — sourced from the same CODESYS tags already proven live in my [web-based SCADA project].

## Status

- ✅ **Read path verified end-to-end.** Live OPC UA values flow into the BACnet object store and were successfully read over a real BACnet ReadProperty request from a separate machine on the network — including both the Device object's static properties and a live Analog Input Present-Value.
- ✅ **Write path verified end-to-end.** `Zone3_Auto` is the one genuinely commandable point, wired back into OPC UA — a BACnet WriteProperty from a separate machine flipped `Z03_AUTO`, which was confirmed not just as a changed tag but as real downstream CODESYS control behavior (the irrigation valve opened, flow and moisture began climbing in response). Sensor-mirror objects (Flow, Moisture, Valve, Fault) correctly reject writes with Write-Access-Denied instead of silently accepting them, matching real BACnet device behavior.

## The interesting part: debugging an undocumented library

The BACnet library used here (`node-bacnet`) documents its *client* role well, but its *server*-side behavior — actually responding to another device's ReadProperty/WriteProperty requests, which is what a gateway needs — is marked **Beta: untested, undocumented, breaking interface** in the library's own feature table. There was no working example to copy.

What that meant in practice:
- The event name a first pass assumed (`request`) doesn't exist in this library at all — confirmed by tracing `_processServiceRequest` in the library's source down to its `confirmedServiceMap`, which showed the real event names are `readProperty` and `writeProperty`.
- The response method signatures (`readPropertyResponse`, `simpleAckResponse`) needed the exact parameter shapes read directly out of `client.js` — not inferred from naming conventions.
- Early "it doesn't work" symptoms from two different BACnet client tools (YABE, Chipkin) turned out to be environment artifacts, not code bugs: both tools were running on the same machine as the gateway and colliding with their own embedded local BACnet devices. That was only provable by testing from a genuinely separate machine — a VM on an isolated network segment (NAT), after first ruling out a phone-hotspot client-isolation issue that was silently dropping bridged traffic.
- WriteProperty's decoded payload shape isn't flat like ReadProperty's — `property`/`value`/`priority` are nested under a `value` key. Assuming they matched crashed the server on the first real write; the fix came from reading the library's own decode function through to its actual `return` statement.

None of that is visible in the final code. It's the reason the final code is correct.

## Stack

Node.js · `node-bacnet` · `node-opcua-client` · CODESYS (OPC UA server) · BACnet/IP

## Running it

```bash
npm install
node src/bacnet-device.js
```

Requires a CODESYS project with the Zone 03 program running and its OPC UA server active on `127.0.0.1:4840`.
