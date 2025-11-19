const mongoose = require('mongoose');

const StreetCleanlinessSchema = new mongoose.Schema({
  properties: {
    score: { type: Number, required: false },
    source: { type: String, required: false },
    raw: { type: mongoose.Schema.Types.Mixed }
  },
  geometry: {
    type: { type: String, enum: ['Point','LineString','Polygon'], required: true },
    coordinates: { type: Array, required: true }
  }
}, { collection: 'street_cleanliness' });

StreetCleanlinessSchema.index({ geometry: '2dsphere' });

module.exports = mongoose.model('StreetCleanliness', StreetCleanlinessSchema);
