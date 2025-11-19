(async ()=>{
  try {
    const Street = require('./models/StreetCleanliness');
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
    await mongoose.connect(uri);
    const pt = { type: 'Point', coordinates: [-118.354,33.8018] };
    const near = await Street.find({ geometry: { $nearSphere: { $geometry: pt, $maxDistance: 5000 } } }).limit(5).lean();
    console.log('found', near.length);
    for (const d of near) console.log(JSON.stringify({ id: d._id, props: Object.keys(d.properties||{}), score: d.properties && d.properties.score, rawKeys: d.properties && d.properties.raw && Object.keys(d.properties.raw||{}) , geomType: d.geometry && d.geometry.type, firstCoord: d.geometry && d.geometry.coordinates && d.geometry.coordinates[0] }, null,2));
    await mongoose.disconnect();
  } catch (e) { console.error('ERR', e); process.exit(1); }
})();
