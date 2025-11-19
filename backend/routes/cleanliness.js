const express = require('express');
const router = express.Router();
const StreetCleanliness = require('../models/StreetCleanliness');

// Import a GeoJSON FeatureCollection into the cleanliness collection.
// This endpoint expects a JSON body containing a FeatureCollection.
router.post('/import', async (req, res) => {
  try {
    const geo = req.body;
    if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
      return res.status(400).json({ message: 'Expected GeoJSON FeatureCollection in request body' });
    }

    // Normalize features into documents
    // Extract a numeric score from common property names (and a few dataset-specific variants),
    // then scale small-range categorical scores to a 0-100 range so downstream thresholds make sense.
    const rawScores = [];
    const docs = geo.features.map(f => {
      const props = f.properties || {};

      // helper: find candidate score property (case-insensitive) from a list of likely keys
      const keys = Object.keys(props || {});
      const preferred = ['score','cleanliness','value','CSRoundSco','csroundsco','CSRoundScore','csroundscore'];
      let found = null;
      for (const k of preferred) {
        const match = keys.find(x => x.toLowerCase() === k.toLowerCase());
        if (match) { found = match; break; }
      }
      // fallback: first numeric-looking property among keys
      if (!found) {
        for (const k of keys) {
          const v = props[k];
          if (v != null && (typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== ''))) { found = k; break; }
        }
      }

      let rawScore = null;
      if (found) {
        const v = props[found];
        rawScore = (v == null || v === '') ? null : Number(v);
        if (isNaN(rawScore)) rawScore = null;
      }
      if (rawScore != null) rawScores.push(rawScore);

      return {
        properties: { score: rawScore != null ? Number(rawScore) : null, source: (props && props.source) || null, raw: props },
        geometry: f.geometry
      };
    });

    // If the imported scores are on a small categorical scale (e.g. 1..5), normalize them to 0-100.
    // Compute min/max from extracted rawScores and rescale if max <= 10 (heuristic).
    const minRaw = rawScores.length > 0 ? Math.min(...rawScores) : null;
    const maxRaw = rawScores.length > 0 ? Math.max(...rawScores) : null;
    if (minRaw != null && maxRaw != null && maxRaw <= 10) {
      const denom = (maxRaw - minRaw) || 1;
      for (const d of docs) {
        if (d.properties && typeof d.properties.score === 'number') {
          // linear rescale to 0..100
          const s = d.properties.score;
          const norm = Math.round(((s - minRaw) / denom) * 10000) / 100; // two decimals
          d.properties.score = norm;
        }
      }
    }

    // Replace existing collection contents with new import (simple strategy)
    await StreetCleanliness.deleteMany({});
    if (docs.length > 0) await StreetCleanliness.insertMany(docs);
    res.json({ success: true, inserted: docs.length });
  } catch (err) {
    console.error('cleanliness import error', err);
    res.status(500).json({ message: 'Failed to import cleanliness data' });
  }
});

module.exports = router;
