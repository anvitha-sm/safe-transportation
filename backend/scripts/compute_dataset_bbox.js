const mongoose = require('mongoose');
const Street = require('../models/StreetCleanliness');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  console.log('Computing bbox (may take a few seconds)...');
  const agg = await Street.aggregate([
    { $project: { coords: '$geometry.coordinates' } },
    { $unwind: '$coords' },
    { $group: {
      _id: null,
      minLon: { $min: { $arrayElemAt: ['$coords', 0] } },
      maxLon: { $max: { $arrayElemAt: ['$coords', 0] } },
      minLat: { $min: { $arrayElemAt: ['$coords', 1] } },
      maxLat: { $max: { $arrayElemAt: ['$coords', 1] } }
    } }
  ]).allowDiskUse(true).exec();

  if (agg && agg.length) {
    const r = agg[0];
    console.log('Dataset bbox:');
    console.log(' lon:', r.minLon, r.maxLon);
    console.log(' lat:', r.minLat, r.maxLat);
  } else {
    console.log('No results from bbox aggregation');
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err && err.message); process.exit(1); });
