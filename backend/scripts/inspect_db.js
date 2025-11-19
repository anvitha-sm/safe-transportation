const mongoose = require('mongoose');
const Street = require('../models/StreetCleanliness');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const count = await db.collection('street_cleanliness').countDocuments();
  let stats = {};
  try {
    stats = await db.command({ collStats: 'street_cleanliness' });
  } catch (e) {
    // ignore
  }
  console.log('Collection stats:', { count, size: stats.storageSize || stats.size || null });

  console.log('\nCounting docs by geometry type sample...');
  const agg = await Street.aggregate([
    { $group: { _id: '$geometry.type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).limit(10);
  console.log('Geometry counts:', agg);

  console.log('\nPrinting 5 sample documents (id, geometry.type, properties keys)');
  const docs = await Street.find().limit(5).lean();
  docs.forEach(d => {
    console.log('--- id:', d._id.toString());
    console.log(' geometry.type=', d.geometry && d.geometry.type);
    console.log(' props keys=', Object.keys(d.properties || {}).slice(0,10));
    if (d.geometry && d.geometry.coordinates) {
      console.log(' coords sample=', JSON.stringify(d.geometry.coordinates.slice(0,3)));
    }
  });

  await mongoose.disconnect();
}

main().catch(e => { console.error(e && e.message); process.exit(1); });
