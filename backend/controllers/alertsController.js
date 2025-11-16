const CommunityAlert = require('../models/CommunityAlert');

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

exports.createAlert = async (req, res) => {
  try {
    console.log('createAlert request body:', req.body);
    try {
      console.log('createAlert debug -> type:', typeof req.body, 'keys:', Object.keys(req.body || {}), 'locationPresent:', req.body && (req.body.location !== undefined), 'descriptionPresent:', req.body && (req.body.description !== undefined));
    } catch (e) {
      console.warn('createAlert debug fail', e);
    }
    const { location, latitude, longitude, description, username, category, severity, date } = req.body;
    if (!location || !description) {
      return res.status(400).json({ message: 'Missing required fields: location and description are required' });
    }

    // Only include latitude/longitude in the payload when present and numeric
    const payload = { location, description, username: username || 'anonymous' };
    if (latitude != null && latitude !== '') payload.latitude = Number(latitude);
    if (longitude != null && longitude !== '') payload.longitude = Number(longitude);
    if (category) payload.category = category;
    if (severity) payload.severity = severity;
    if (date) payload.date = new Date(date);

    const alert = await CommunityAlert.create(payload);
    res.json({ success: true, alert });
  } catch (err) {
    console.error('createAlert error', err);
    res.status(500).json({ message: 'Failed to create alert' });
  }
};

exports.listAlerts = async (req, res) => {
  try {
    const { lat, lon, category, severity } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (severity) filter.severity = severity;

    const all = await CommunityAlert.find(filter).lean();

    if (lat != null && lon != null) {
      const latN = parseFloat(lat);
      const lonN = parseFloat(lon);
      const withDist = all.map((a) => {
        const hasCoords = a.latitude != null && a.longitude != null;
        const distance = hasCoords ? distanceMeters(latN, lonN, a.latitude, a.longitude) : Number.POSITIVE_INFINITY;
        return { ...a, distance };
      });
      // sort with real distances first; alerts without coords go to the end
      withDist.sort((x, y) => (x.distance === Infinity ? 1 : (y.distance === Infinity ? -1 : x.distance - y.distance)));
      // convert Infinity distances back to null for client friendliness
      const normalized = withDist.map((a) => ({ ...a, distance: a.distance === Number.POSITIVE_INFINITY ? null : a.distance }));
      return res.json({ alerts: normalized });
    }

    all.sort((a,b) => new Date(b.date) - new Date(a.date));
    res.json({ alerts: all });
  } catch (err) {
    console.error('listAlerts error', err);
    res.status(500).json({ message: 'Failed to list alerts' });
  }
};

exports.geocode = async (req, res) => {
  try {
    const q = (req.query.query || "").trim();
    if (!q) return res.json({ suggestions: [] });
    // If MAPBOX_TOKEN is present, prefer Mapbox forward geocoding for richer suggestions
    if (process.env.MAPBOX_TOKEN) {
      try {
        const token = process.env.MAPBOX_TOKEN;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&autocomplete=true&limit=8`;
        const resp = await fetch(url);
        if (resp.ok) {
          const j = await resp.json();
          const suggestions = (j.features || []).map((f) => ({ place_name: f.place_name, center: f.center }));
          return res.json({ suggestions });
        }
      } catch (err) {
        console.warn('Mapbox geocode failed, falling back to local index', err);
      }
    }

    // fallback: find alerts with location matching the query (case-insensitive)
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matches = await CommunityAlert.find({ location: regex }).lean();

    // group by location string to return unique suggestions
    const seen = new Map();
    for (const m of matches) {
      if (!seen.has(m.location)) {
        seen.set(m.location, { place_name: m.location, center: [m.longitude, m.latitude] });
      }
    }

    const suggestions = Array.from(seen.values()).slice(0, 8);
    res.json({ suggestions });
  } catch (err) {
    console.error('geocode error', err);
    res.status(500).json({ suggestions: [] });
  }
};
