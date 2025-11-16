const mongoose = require("mongoose");

const RouteSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true },
  date: { type: Date, default: Date.now },
  mode: { type: String },
});

module.exports = RouteSchema;
