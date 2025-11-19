const mongoose = require('mongoose');
const Street = require('../models/StreetCleanliness');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  const center = { type: 'Point', coordinates: [-118.4054, 34.0686] };
  const distances = [50, 500, 2000, 5000];
  for (const d of distances) {
    const docs = await Street.find({ geometry: { $nearSphere: { $geometry: center, $maxDistance: d } } }).limit(5).lean();
    console.log(`\nWithin ${d} meters: found ${docs.length}`);
    docs.forEach((doc, idx) => {
      console.log(`  [${idx}] id=${doc._id.toString()} props_keys=${Object.keys(doc.properties||{}).slice(0,6)} coords0=${(doc.geometry.coordinates && doc.geometry.coordinates[0]) || 'n/a'}`);
    });
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e && e.message); process.exit(1); });
