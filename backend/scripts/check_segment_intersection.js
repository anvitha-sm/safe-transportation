const mongoose = require('mongoose');
const StreetCleanliness = require('../models/StreetCleanliness');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const samples = [
    { start: [-118.35382,33.80127], end: [-118.35438,33.80187] },
    { start: [-118.35438,33.80187], end: [-118.35449,33.80195] },
    { start: [-118.35449,33.80195], end: [-118.35462,33.80203] }
  ];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const line = { type: 'LineString', coordinates: [s.start, s.end] };
    console.log(`\nChecking sample[${i}] line:`, JSON.stringify(line));

    try {
      const intersectDoc = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: line } } }).lean();
      console.log('  $geoIntersects found:', !!intersectDoc);
      if (intersectDoc) {
        console.log('  sample intersects doc id:', intersectDoc._id.toString());
        continue;
      }

      // Try midpoint point containment
      const mx = (s.start[0] + s.end[0]) / 2;
      const my = (s.start[1] + s.end[1]) / 2;
      const point = { type: 'Point', coordinates: [mx, my] };
      const pointDoc = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: point } } }).lean();
      console.log('  midpoint $geoIntersects found:', !!pointDoc);
      if (pointDoc) console.log('  midpoint matched id:', pointDoc._id.toString());

      // Try $nearSphere (1 meter, 100m fallback)
      const nearDocs = await StreetCleanliness.find({ geometry: { $nearSphere: { $geometry: point, $maxDistance: 100 } } }).limit(1).lean();
      console.log('  $nearSphere within 100m found:', nearDocs.length > 0);
      if (nearDocs.length) console.log('  near id:', nearDocs[0]._id.toString());

      // Try swapped coords (in case features were imported lat,lon by mistake)
      const swappedLine = { type: 'LineString', coordinates: [[s.start[1], s.start[0]], [s.end[1], s.end[0]]] };
      const swappedIntersect = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: swappedLine } } }).lean();
      console.log('  swapped-coords $geoIntersects found:', !!swappedIntersect);
      if (swappedIntersect) console.log('  swapped matched id:', swappedIntersect._id.toString());

      // Try a tiny bbox/polygon buffer around the segment (approx 3m box)
      const buffer = 0.00003; // ~3m in degrees (approx)
      const poly = {
        type: 'Polygon',
        coordinates: [[
          [s.start[0] - buffer, s.start[1] - buffer],
          [s.start[0] + buffer, s.start[1] - buffer],
          [s.end[0] + buffer, s.end[1] + buffer],
          [s.end[0] - buffer, s.end[1] + buffer],
          [s.start[0] - buffer, s.start[1] - buffer]
        ]]
      };
      const polyDoc = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: poly } } }).lean();
      console.log('  tiny polygon $geoIntersects found:', !!polyDoc);
      if (polyDoc) console.log('  poly matched id:', polyDoc._id.toString());

    } catch (err) {
      console.error('  query error:', err && err.message);
    }
  }

  // Also try to find the nearest cleanliness doc to sample[0] midpoint within 50km
  const s0 = samples[0];
  const mx0 = (s0.start[0] + s0.end[0]) / 2;
  const my0 = (s0.start[1] + s0.end[1]) / 2;
  const mid0 = { type: 'Point', coordinates: [mx0, my0] };
  console.log('\nSearching for nearest doc to sample[0] midpoint (50km)');
  const nearBig = await StreetCleanliness.findOne({ geometry: { $nearSphere: { $geometry: mid0, $maxDistance: 50000 } } }).lean();
  if (nearBig) {
    console.log('Nearest doc id:', nearBig._id.toString(), 'geometry.type=', nearBig.geometry && nearBig.geometry.type);
    if (nearBig.geometry && nearBig.geometry.coordinates) {
      const coords = nearBig.geometry.coordinates;
      if (Array.isArray(coords)) {
        console.log('Sample of stored coordinates:', JSON.stringify(coords.slice(0,3)));
      }
    }
  } else {
    console.log('No docs found within 50km of sample[0] midpoint');
  }

  console.log('\nSearching for any docs within 1km of sample[0] midpoint');
  const near1k = await StreetCleanliness.find({ geometry: { $nearSphere: { $geometry: mid0, $maxDistance: 1000 } } }).limit(5).lean();
  console.log('  count within 1km:', near1k.length);
  if (near1k.length) console.log('  sample geometry type:', near1k[0].geometry.type);

  await mongoose.disconnect();
  console.log('\nDone');
}

main().catch(err => { console.error(err); process.exit(1); });
