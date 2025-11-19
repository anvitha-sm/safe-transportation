const mongoose = require('mongoose');
const StreetCleanliness = require('../models/StreetCleanliness');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  // Bounding box around Rodeo Drive / Beverly Hills area
  const minLon = -118.41, minLat = 34.066;
  const maxLon = -118.39, maxLat = 34.071;

  console.log(`Searching bbox: lon [${minLon},${maxLon}] lat [${minLat},${maxLat}]`);

  // $geoWithin with $box
  const count = await StreetCleanliness.countDocuments({ geometry: { $geoWithin: { $box: [[minLon, minLat], [maxLon, maxLat]] } } });
  console.log('Count within bbox:', count);

  if (count > 0) {
    const sample = await StreetCleanliness.find({ geometry: { $geoWithin: { $box: [[minLon, minLat], [maxLon, maxLat]] } } }).limit(5).lean();
    console.log('Sample documents:');
    for (const doc of sample) {
      console.log('--- doc id:', doc._id.toString());
      console.log(' geometry.type=', doc.geometry && doc.geometry.type);
      if (doc.geometry && Array.isArray(doc.geometry.coordinates)) {
        console.log(' geometry.coordinates sample:', JSON.stringify(doc.geometry.coordinates.slice(0,3)));
      }
      console.log(' properties keys:', Object.keys(doc.properties || {}).slice(0,10));
    }
  } else {
    console.log('No documents in bbox.');
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(err => { console.error(err && err.message); process.exit(1); });
