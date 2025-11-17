const mongoose = require('mongoose');

const CommunityAlertSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  location: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type: Number },
  description: { type: String, required: true },
  category: { type: String, default: '' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'low' },
});

module.exports = mongoose.model('CommunityAlert', CommunityAlertSchema);
