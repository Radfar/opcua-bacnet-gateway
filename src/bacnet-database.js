const Bacnet = require("node-bacnet");

const objects = {
    device: {
        type: Bacnet.enum.ObjectType.DEVICE,
        instance: 10003,
        name: "Water_Testbed_Gateway"
    },

    analogInputs: [
        {
            type: Bacnet.enum.ObjectType.ANALOG_INPUT,
            instance: 1,
            name: "Z03_FLOW",
            description: "Zone 03 Water Flow",
            presentValue: 25.5,
            units: Bacnet.enum.EngineeringUnits.LITERS_PER_MINUTE
        }
    ]
};


module.exports = objects;