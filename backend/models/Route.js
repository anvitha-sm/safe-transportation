const mongoose = require("mongoose");

const RouteSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  date: { type: Date, default: Date.now },
  mode: { type: String },
  feedback: {
    ratings: {
      lighting: { type: Number },
      footTraffic: { type: Number },
      cleanliness: { type: Number },
      crime: { type: Number },
      speed: { type: Number },
      cost: { type: Number },
    },
    comments: { type: String },
    ratedAt: { type: Date },
    ratedBy: { type: String },
  },
});

module.exports = RouteSchema;
