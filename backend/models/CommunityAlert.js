const mongoose = require('mongoose');

const CommunityAlertSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  location: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  // latitude/longitude are optional now; alerts can be saved without precise coords
  description: { type: String, required: true },
  // optional category (e.g., "road", "lighting", "safety")
  category: { type: String, default: '' },
  // severity: low | medium | high | urgent
  severity: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'low' },
});

module.exports = mongoose.model('CommunityAlert', CommunityAlertSchema);
