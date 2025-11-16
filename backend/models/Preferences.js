const mongoose = require("mongoose");

const PreferencesSchema = new mongoose.Schema({
  lighting: { type: Number, default: 10 },
  footTraffic: { type: Number, default: 10 },
  cleanliness: { type: Number, default: 10 },
  crime: { type: Number, default: 10 },
  speed: { type: Number, default: 10 },
  cost: { type: Number, default: 10 },
});

module.exports = PreferencesSchema;
