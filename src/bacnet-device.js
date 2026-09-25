const Bacnet = require("node-bacnet");

const options = {
    port: 47808, // BACnet/IP default UDP port
    interface: "0.0.0.0"
};

const client = new Bacnet(options);

console.log("BACnet/IP device started");
console.log("Listening on UDP port 47808");

// Respond to Who-Is requests
client.on("whoIs", (device) => {
    console.log("Who-Is received:", device);
});