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

// POST /api/cleanliness/enrich
// Accepts { routes: [ { geometry: { type: 'LineString', coordinates: [...] }, ... } ] }
// Returns same routes with added cleanliness fields: safetyScore (0..1), safetyDescription, safetyMatchedCount
router.post('/enrich', async (req, res) => {
  try {
    const body = req.body || {};
    const routes = Array.isArray(body.routes) ? body.routes : (body.route ? [body.route] : null);
    if (!routes) return res.status(400).json({ message: 'Expected routes array in body' });

    const mongoose = require('mongoose');
    const StreetCleanliness = require('../models/StreetCleanliness');

    function toRad(v) { return (v * Math.PI) / 180; }
    function haversineMeters(lat1, lon1, lat2, lon2) {
      const R = 6371; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); return R * c * 1000;
    }

    const enriched = [];
    for (const route of routes) {
      try {
        // Extract coordinates array
        let coords = [];
        if (route && route.geometry) {
          if (route.geometry.type === 'LineString' && Array.isArray(route.geometry.coordinates)) coords = route.geometry.coordinates;
          else if (route.geometry.points && Array.isArray(route.geometry.points.coordinates)) coords = route.geometry.points.coordinates;
          else if (Array.isArray(route.geometry)) coords = route.geometry;
        }
        if (!coords || coords.length < 2) {
          route.safetyScore = null; route.safetyDescription = 'unknown'; route.safetyMatchedCount = 0; enriched.push(route); continue;
        }

        // build segments and sample to avoid too many DB calls
        const segments = [];
        let totalDistance = 0;
        for (let i = 0; i < coords.length - 1; i++) {
          const a = coords[i]; const b = coords[i+1];
          const segLen = haversineMeters(a[1], a[0], b[1], b[0]);
          totalDistance += segLen;
          const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2; // lon, lat midpoint
          segments.push({ a, b, mx, my, segLen });
        }

        const MAX_SEGMENTS = 1000;
        let sampleStep = 1; if (segments.length > MAX_SEGMENTS) sampleStep = Math.ceil(segments.length / MAX_SEGMENTS);
        const sampled = segments.filter((_, idx) => idx % sampleStep === 0);

        let weightedSum = 0; let matchedDistance = 0; let matchCounts = 0; let sawLargeScore = false;

        // helper to extract numeric score from a document
        function extractScoreFromDoc(doc) {
          if (!doc || !doc.properties) return null;
          const p = doc.properties;
          let sRaw = null; let usedKey = null;
          if (typeof p.score === 'number') { sRaw = p.score; usedKey = 'score'; }
          else if (p.CSGrade != null) { sRaw = p.CSGrade; usedKey = 'CSGrade'; }
          else if (p.CSRoundSco != null) { sRaw = p.CSRoundSco; usedKey = 'CSRoundSco'; }
          else if (p.CSscor != null) { sRaw = p.CSscor; usedKey = 'CSscor'; }
          else if (p.CSRoundScore != null) { sRaw = p.CSRoundScore; usedKey = 'CSRoundScore'; }
          else if (p.cleanliness != null) { sRaw = p.cleanliness; usedKey = 'cleanliness'; }
          else if (p.value != null) { sRaw = p.value; usedKey = 'value'; }
          else if (p.raw) {
            const raw = p.raw || {};
            if (raw.CSGrade != null) { sRaw = raw.CSGrade; usedKey = 'CSGrade'; }
            else if (raw.CSRoundSco != null) { sRaw = raw.CSRoundSco; usedKey = 'CSRoundSco'; }
            else if (raw.CSscor != null) { sRaw = raw.CSscor; usedKey = 'CSscor'; }
            else if (raw.CSRoundScore != null) { sRaw = raw.CSRoundScore; usedKey = 'CSRoundScore'; }
            else if (raw.score != null) { sRaw = raw.score; usedKey = 'score'; }
            else if (raw.cleanliness != null) { sRaw = raw.cleanliness; usedKey = 'cleanliness'; }
            else if (raw.value != null) { sRaw = raw.value; usedKey = 'value'; }
          }
          if (sRaw == null || isNaN(Number(sRaw))) return null;
          const num = Number(sRaw);
          let treatAsCSGrade = false;
          if (usedKey === 'CSGrade') treatAsCSGrade = true;
          else if (usedKey === 'cleanliness' || usedKey === 'CSRoundSco' || usedKey === 'CSRoundScore' || usedKey === 'CSscor') {
            if (Number.isInteger(num) && num >= 1 && num <= 3) treatAsCSGrade = true;
          } else if (Number.isInteger(num) && num >= 1 && num <= 3) treatAsCSGrade = true;
          if (treatAsCSGrade) {
            const minG = 1.0; const maxG = 3.0;
            const recip = 1 / Math.max(0.0001, num);
            const minRecip = 1 / maxG; const maxRecip = 1 / minG;
            const norm = (recip - minRecip) / Math.max(1e-6, (maxRecip - minRecip));
            return norm * 100;
          }
          return num;
        }

        // process in batches
        const BATCH_SIZE = 40;
        for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
          const batch = sampled.slice(i, i + BATCH_SIZE);
          const promises = batch.map(s => {
            const pt = { type: 'Point', coordinates: [s.mx, s.my] };
            return StreetCleanliness.aggregate([ { $geoNear: { near: pt, distanceField: 'dist', spherical: true } }, { $limit: 1 } ]).allowDiskUse(true).exec().catch(() => []);
          });
          const results = await Promise.all(promises);
          for (let j = 0; j < batch.length; j++) {
            const seg = batch[j]; const docs = results[j] || [];
            const found = Array.isArray(docs) && docs.length > 0 ? docs[0] : null;
            if (found) {
              const s = extractScoreFromDoc(found);
              if (s != null) {
                if (typeof s === 'number' && s > 10) sawLargeScore = true;
                weightedSum += s * seg.segLen;
                matchedDistance += seg.segLen;
                matchCounts += 1;
              }
            }
          }
        }

        if (!sawLargeScore && matchedDistance > 0) weightedSum = weightedSum * 100;

        if (totalDistance <= 0 || matchedDistance === 0) {
          route.safetyScore = null; route.safetyDescription = 'unknown'; route.safetyMatchedCount = matchCounts;
        } else {
          const avgByTotal = weightedSum / totalDistance; const normalized01 = avgByTotal / 100;
          route.safetyScore = Math.round(normalized01 * 1000) / 1000;
          if (route.safetyScore >= 0.75) route.safetyDescription = 'clean';
          else if (route.safetyScore >= 0.40) route.safetyDescription = 'moderate';
          else route.safetyDescription = 'dirty';
          route.safetyMatchedCount = matchCounts; route.safetyMatchedDistance = Math.round(matchedDistance * 100) / 100;
        }
      } catch (e) {
        console.warn('enrich route failure', e);
        route.safetyScore = null; route.safetyDescription = 'unknown'; route.safetyMatchedCount = 0;
      }
      enriched.push(route);
    }

    res.json({ routes: enriched });
  } catch (err) {
    console.error('cleanliness.enrich error', err);
    res.status(500).json({ message: 'Failed to enrich routes' });
  }
});
