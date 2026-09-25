const Bacnet = require("node-bacnet");

const DEVICE_INSTANCE = 10003;
const DEVICE_VENDOR_ID = 999;
const MAX_APDU = 1476;

const options = {
    port: 47808,
    interface: "0.0.0.0"
};

const client = new Bacnet(options);

console.log("BACnet/IP device started");
console.log(`Device Instance: ${DEVICE_INSTANCE}`);
console.log("Listening on UDP port 47808");

// Handle BACnet Who-Is requests
client.on("whoIs", (device) => {
    console.log("Who-Is received:", device);

    // Respond with I-Am
    client.iAmResponse(
        device.header.sender,
        DEVICE_INSTANCE,
        0,
        DEVICE_VENDOR_ID
    );

    console.log(
        `I-Am sent: Device ${DEVICE_INSTANCE} -> ${device.header.sender.address}`
    );
});