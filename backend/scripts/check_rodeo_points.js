const mongoose = require('mongoose');
const StreetCleanliness = require('../models/StreetCleanliness');

function extractScore(props) {
  if (!props) return null;
  const keys = Object.keys(props);
  const tryKeys = ['CSGrade','CSscor','CSRoundSco','CSRoundScore','score','cleanliness','value','cs','score_raw','CS_score','CS'];
  for (const k of tryKeys) {
    if (k in props) {
      const v = parseFloat(props[k]);
      if (!isNaN(v)) return v;
    }
  }
  // try nested properties.raw
  if (props.raw) {
    for (const k of tryKeys) {
      if (k in props.raw) {
        const v = parseFloat(props.raw[k]);
        if (!isNaN(v)) return v;
      }
    }
  }
  // fallback: find any numeric-looking value
  for (const k of keys) {
    const v = parseFloat(props[k]);
    if (!isNaN(v)) return v;
  }
  return null;
}

function normalizeToSafety(val) {
  // Accept val in several formats:
  // - CSGrade style: 1..3 (lower is better). We'll detect if between 1 and 3 and use reciprocal-normalization so 1->1, 3->0.
  // - Fractional 0..1 where higher is better: pass-through
  // - 0..100 scale where higher is better: /100
  if (val == null || isNaN(val)) return null;
  // If value looks like CSGrade (1..3)
  if (val >= 1 && val <= 3) {
    // reciprocal mapping: map 1..3 -> 1..0 using 1/x normalization then scale
    // map s = 1/val; normalize between s_min=1/3 and s_max=1/1 -> (s - 1/3)/(1 - 1/3)
    const s = 1 / val;
    const min = 1 / 3;
    const max = 1 / 1;
    const norm = (s - min) / (max - min);
    return Math.max(0, Math.min(1, norm));
  }
  // If looks like 0..1 fractional
  if (val >= 0 && val <= 1) return val;
  // If looks like 0..100
  if (val > 1 && val <= 100) return val / 100;
  // otherwise null
  return null;
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cleanliness';
  console.log('Connecting to', uri);
  await mongoose.connect(uri).catch(e => { throw e; });

  // Two points near Rodeo Drive, Beverly Hills (lon, lat)
  const points = [
    { name: 'RodeoPointA', coords: [-118.4034, 34.0686] },
    { name: 'RodeoPointB', coords: [-118.4058, 34.0690] }
  ];

  for (const p of points) {
    console.log('\nChecking', p.name, p.coords);
    const pt = { type: 'Point', coordinates: p.coords };
    // Try direct containment
    const doc = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: pt } } }).lean();
    if (doc) {
      console.log('  Found containing doc id:', doc._id.toString());
      const raw = extractScore(doc.properties || {});
      console.log('  raw score value from properties:', raw);
      const safety = normalizeToSafety(raw);
      console.log('  normalized safety (0..1, 1 best):', safety);
      continue;
    }

    // Try nearest within 50m
    const near = await StreetCleanliness.find({ geometry: { $nearSphere: { $geometry: pt, $maxDistance: 50 } } }).limit(1).lean();
    if (near && near.length) {
      console.log('  Nearest within 50m id:', near[0]._id.toString());
      const raw = extractScore(near[0].properties || {});
      console.log('  raw score value from properties:', raw);
      const safety = normalizeToSafety(raw);
      console.log('  normalized safety (0..1, 1 best):', safety);
      continue;
    }

    // Try broader 500m search
    const nearBig = await StreetCleanliness.find({ geometry: { $nearSphere: { $geometry: pt, $maxDistance: 500 } } }).limit(1).lean();
    if (nearBig && nearBig.length) {
      console.log('  Nearest within 500m id:', nearBig[0]._id.toString());
      const raw = extractScore(nearBig[0].properties || {});
      console.log('  raw score value from properties:', raw);
      const safety = normalizeToSafety(raw);
      console.log('  normalized safety (0..1, 1 best):', safety);
      continue;
    }

    console.log('  No cleanliness docs found near this point (within 500m)');
  }

  await mongoose.disconnect();
  console.log('\nDone');
}

main().catch(err => { console.error(err && err.message); process.exit(1); });
