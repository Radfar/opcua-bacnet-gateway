# opcua-bacnet-gateway

A software-only OPC UA → BACnet/IP gateway, built in Node.js. It polls live process data from an industrial controller over OPC UA and exposes it as real BACnet/IP objects — readable and writable by any standard BACnet client — with no dedicated gateway hardware and no commercial gateway license.

Built and verified against a CODESYS SoftPLC-based irrigation testbed (Zone 03: flow, moisture, valve position, fault status, and an automatic-mode command point).

## Architecture

```
Industrial Control System (CODESYS, OPC UA server)
        │ OPC UA
        ▼
Node.js Integration Layer  ──►  PostgreSQL Historian
 (OPC UA client + BACnet/IP server)
        │ BACnet/IP
        ▼
BACnet Client / BAS environment
```

See `docs/images/architecture.png` for the full diagram (current implementation vs. future roadmap).

## Verified Capabilities

### Device Discovery
Responds to BACnet `Who-Is` broadcasts with a correct `I-Am`, identifying itself as a BACnet device on the network.

### ReadProperty
Returns live `Present-Value` for each mapped object, tracking the underlying OPC UA source in real time.

- Flow, moisture → Analog Input
- Valve, fault → Binary Value
- Automatic mode → Binary Output

![ReadProperty verification](docs/images/read-property.png)

### WriteProperty
The automatic-mode point (`Z03_AUTO`) is genuinely writable — a BACnet `WriteProperty` is transferred as a real OPC UA write back to the controller, producing actual downstream PLC behavior, not just a stored flag in the gateway.

All other points are read-only sensor mirrors and correctly reject writes with a decoded `Write-Access-Denied` BACnet error, rather than timing out or silently failing.

![WriteProperty verification](docs/images/write-property.png)

### COV (Change-of-Value) Subscriptions
Clients can subscribe to any object instead of polling. The gateway tracks per-object subscribers and pushes a notification (`UnconfirmedCOVNotification` or `ConfirmedCOVNotification`, depending on what the subscriber requested) the moment a value actually changes — including one immediate notification on successful subscription, per the BACnet spec.

Verified end-to-end: live CODESYS value changes streamed to an independent BACnet client on a separate machine, with zero polling on the client side.

![COV notifications in the client log](docs/images/cov-log.png)
![Live dashboard updating via COV](docs/images/dashboard.png)

A minimal operator-style web dashboard (Express + vanilla JS) was built on the client side specifically to demonstrate this — each value shows a `COV` tag when it arrives via push rather than initial read.

### Historian
Every polled value and every successful write is logged to a PostgreSQL database (`equipment` / `tags` / `tag_values` schema), building a time-series record for later trend review.

## Independent Test Environment

The BACnet client (and dashboard) runs on a separate virtual machine, not on the same host as the gateway — this ensures testing exercises real BACnet/IP network communication rather than only the gateway's own in-process logic.

## Not Yet Implemented

Documented honestly rather than implied:

- BACnet/SC (secure, TLS-based BACnet) — plain BACnet/IP only, currently
- Validation against a commercial BAS supervisory platform (e.g. Niagara) — tested against an independent custom client only
- AI-assisted historian analytics — historian data is being collected; analysis layer is planned, not built
- Multi-protocol source support — architecture generalizes beyond OPC UA, but only OPC UA is implemented

## Setup

```
npm install
cp .env.example .env   # fill in your DB and OPC UA connection details
node src/bacnet-device.js
```

## License

See `LICENSE`.
