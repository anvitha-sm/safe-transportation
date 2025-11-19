exports.busDirections = async (req, res) => {
    console.log('TRANSITLAND_TOKEN from env:', process.env.TRANSITLAND_TOKEN);
  try {
    const { from, to, date, time } = req.query;
    if (!from || !to) return res.status(400).json({ message: 'Missing from or to coordinates' });
    const token = process.env.TRANSITLAND_TOKEN;
    if (!token) return res.status(500).json({ message: 'Transitland token not configured on server' });
 
    async function getNearestStop(lonlat) {
      const [lon, lat] = lonlat.split(',').map(Number);
      const stopsUrl = `https://transit.land/api/v2/rest/stops?lon=${lon}&lat=${lat}&r=1000&per_page=1&api_key=${token}`;
      const stopsResp = await fetch(stopsUrl);
      const stopsJson = await stopsResp.json();
      console.log('Transitland stops API response:', stopsJson);
      if (stopsJson.stops && stopsJson.stops.length > 0) {
        const stop = stopsJson.stops[0];
        console.log('Snapped to stop:', stop.name, stop.lon, stop.lat);
        return `${stop.lon},${stop.lat}`;
      }
      console.log('No nearby stop found, using original coordinates');
      return lonlat;
    }

    const snappedFrom = await getNearestStop(from);
    const snappedTo = await getNearestStop(to);
    console.log('Snapped origin:', snappedFrom, 'Snapped destination:', snappedTo);

    const now = new Date();
    const queryDate = date || now.toISOString().slice(0, 10); 
    const queryTime = time || now.toTimeString().slice(0, 8); 
    const url = `https://transit.land/api/v2/routing/otp/plan?fromPlace=${snappedFrom}&toPlace=${snappedTo}&date=${queryDate}&time=${queryTime}&api_key=${token}`;
    console.log('Transitland Routing API URL:', url);
    let resp = await fetch(url);
    let respText = await resp.text();
    let errorJson = null;
    if (!resp.ok) {
      try { errorJson = JSON.parse(respText); } catch (e) {}
      console.warn('Transitland routing non-ok', respText);

      console.warn('Transitland status:', resp.status);
      console.warn('Transitland headers:', JSON.stringify([...resp.headers]));
      if (errorJson) {
        console.warn('Transitland error JSON:', errorJson);
      } else {
        console.warn('Transitland error not JSON:', respText);
      }
      return res.status(500).json({ message: 'Failed to fetch bus routes', details: respText, status: resp.status });
    }
    console.log('Transitland Routing API response:', respText);
    const j = JSON.parse(respText);

    const rawItins = j.plan?.itineraries || [];

    const limited = rawItins.slice(0, 2);

    function decodePolyline(encoded) {
      if (!encoded) return [];
      let index = 0, lat = 0, lng = 0, coordinates = [];
      const length = encoded.length;
      while (index < length) {
        let b, shift = 0, result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += deltaLat;
        shift = 0; result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += deltaLng;
        coordinates.push([lng / 1e5, lat / 1e5]);
      }
      return coordinates;
    }

    const itineraries = limited.map((itinerary) => {
      const coords = [];
      if (Array.isArray(itinerary.legs)) {
        for (const leg of itinerary.legs) {
            try {
              const pts = leg.legGeometry && leg.legGeometry.points;
              if (typeof pts === 'string' && pts.length > 0) {
                const dec = decodePolyline(pts);
                coords.push(...dec);
              } else if (leg.geometry && leg.geometry.type === 'LineString' && Array.isArray(leg.geometry.coordinates)) {
                coords.push(...leg.geometry.coordinates);
              }
            } catch (e) {
              console.warn('leg decode failed', e);
            }
        }
      }
      const geo = coords.length > 0 ? { type: 'LineString', coordinates: coords } : null;
      return {
        duration: itinerary.duration,
        distance: itinerary.distance,
        startTime: itinerary.startTime,
        endTime: itinerary.endTime,
        walkTime: itinerary.walkTime,
        walkDistance: itinerary.walkDistance,
        transitTime: itinerary.transitTime,
        transitDistance: itinerary.transitDistance,
        waitingTime: itinerary.waitingTime,
        transfers: itinerary.transfers,
        legs: itinerary.legs,
        geometry: geo,
      };
    });
    res.json({ routes: itineraries });
  } catch (err) {
    console.error('busDirections proxy error', err);
    res.status(500).json({ message: 'Failed to get bus directions' });
  }
};
const CommunityAlert = require('../models/CommunityAlert');
const StreetCleanliness = require('../models/StreetCleanliness');

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
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
      withDist.sort((x, y) => (x.distance === Infinity ? 1 : (y.distance === Infinity ? -1 : x.distance - y.distance)));
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
    console.log('geocode called with query=', q, 'MAPBOX_TOKEN present=', !!(process.env.MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN));
    if (!q) return res.json({ suggestions: [] });
    if (process.env.MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN) {
      try {
        const token = process.env.MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;

            const BBOX = [-119.9, 33.5, -117.4, 34.6];
            const bboxParam = BBOX.join(',');
            const PROXIMITY = '-118.2437,34.0522';
            const TYPES = 'address,place,poi,neighborhood';
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&autocomplete=true&limit=8&bbox=${bboxParam}&country=us&proximity=${PROXIMITY}&types=${TYPES}`;
            const resp = await fetch(url);
            console.log('Mapbox geocode URL:', url);
            if (resp.ok) {
              const j = await resp.json();
              console.log('Mapbox returned features count:', (j.features || []).length);
              console.log('Mapbox feature centers (first 8):', (j.features || []).slice(0,8).map(f => f.center));
              const inBox = (center) => {
                if (!center || center.length !== 2) return false;
                const [lon, lat] = center;
                return lon >= BBOX[0] && lon <= BBOX[2] && lat >= BBOX[1] && lat <= BBOX[3];
              };
              const allowedPlaceKeywords = ['Los Angeles','Santa Monica','Irvine','Westwood','Beverly','Pasadena','Long Beach','Anaheim','Santa Barbara','Glendale','Hollywood','Venice','UCLA','Westwood','LA'];
              const containsAllowedKeyword = (name) => {
                if (!name) return false;
                return allowedPlaceKeywords.some(k => new RegExp(`\\b${k.replace(/[-\\/\\^$*+?.()|[\\]\\\\]/g,'\\$&')}\\b`, 'i').test(name));
              };

              const suggestions = (j.features || [])
                .filter(f => {
                  const placeTypeOk = Array.isArray(f.place_type) && f.place_type.some(pt => ['address','place','poi','neighborhood'].includes(pt));
                  const centerOk = inBox(f.center);
                  const contextOk = Array.isArray(f.context) && f.context.some(c => (c.short_code || '').toUpperCase().startsWith('US-CA'));
                  const nameOk = containsAllowedKeyword(f.place_name);
                  return placeTypeOk && (centerOk || contextOk || nameOk);
                })
                .map((f) => ({ place_name: f.place_name, center: f.center }));

                if ((!suggestions || suggestions.length === 0) && (j.features || []).length > 0) {
                  console.warn('Mapbox suggestions filtered out by bbox/CA filters; falling back to DB suggestions if available');
                } else {
                  return res.json({ suggestions });
                }
            }
      } catch (err) {
        console.warn('Mapbox geocode failed, falling back to local index', err);
      }
    }
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matches = await CommunityAlert.find({ location: regex }).lean();
    const seen = new Map();
    const allowedPlaceKeywords = ['Los Angeles','Santa Monica','Irvine','Westwood', 'Torrance', 'Beverly','Pasadena','Long Beach','Anaheim','Santa Barbara','Glendale','Hollywood','Venice','UCLA','LA'];
    const containsAllowedKeyword = (name) => {
      if (!name) return false;
      return allowedPlaceKeywords.some(k => new RegExp(`\\b${k.replace(/[-\\/\\^$*+?.()|[\\]\\\\]/g,'\\$&')}\\b`, 'i').test(name));
    };

    for (const m of matches) {
      const lon = m.longitude;
      const lat = m.latitude;
      const inBox = lon != null && lat != null && lon >= -119.9 && lon <= -117.4 && lat >= 33.5 && lat <= 34.6;
      const nameHasSoCal = containsAllowedKeyword(m.location);
      if (!seen.has(m.location) && (inBox || nameHasSoCal)) {
        seen.set(m.location, { place_name: m.location, center: lon != null && lat != null ? [lon, lat] : null });
      }
    }

    const suggestions = Array.from(seen.values()).slice(0, 8);
    res.json({ suggestions });
  } catch (err) {
    console.error('geocode error', err);
    res.status(500).json({ suggestions: [] });
  }
};
exports.directions = async (req, res) => {
  try {
    const { from, to, profiles } = req.query;
    if (!from || !to) return res.status(400).json({ message: 'Missing from or to coordinates' });

    const allowedProfiles = (profiles || 'driving,walking').split(',').map(p => p.trim()).filter(Boolean);
    const supported = ['driving', 'walking'];
    const useProfiles = allowedProfiles.filter(p => supported.includes(p));
    if (useProfiles.length === 0) useProfiles.push('driving');

    const token = process.env.MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) {
      return res.status(500).json({ message: 'Mapbox token not configured on server' });
    }
    const results = [];
    const noHighways = req.query.noHighways === 'true';
    for (const profile of useProfiles) {
      try {
        let excludeParam = '';
        if (profile === 'driving' && noHighways) {
          excludeParam = '&exclude=highways';
        }
        const alternativesParam = profile === 'driving' ? '&alternatives=true' : '&alternatives=false';
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${from};${to}?geometries=polyline&overview=full${alternativesParam}${excludeParam}&access_token=${token}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn('Mapbox directions non-ok', await resp.text());
          continue;
        }
        const j = await resp.json();
        const routes = j.routes || [];
        if (routes.length > 0) {
          const take = profile === 'driving' ? routes.slice(0, 2) : [routes[0]];
          take.forEach((route, idx) => {
            results.push({
              profile,
              distance: route.distance,
              duration: route.duration,
              geometry: route.geometry,

              routeIndex: idx,
            });
          });
        }
      } catch (err) {
        console.warn('directions error for profile', profile, err);
      }
    }
    const [minLon, minLat, maxLon, maxLat] = [-119.9, 33.5, -117.4, 34.6];

    const parseLonLat = (str) => {
      const parts = str.split(',').map(s => parseFloat(s.trim()));
      return { lon: parts[0], lat: parts[1] };
    };
    const fromPt = parseLonLat(from);
    const toPt = parseLonLat(to);
    console.log('directions: parsed fromPt=', fromPt, 'toPt=', toPt, 'bounds=', { minLon, minLat, maxLon, maxLat });
    const inBBox = (pt) => pt && typeof pt.lon === 'number' && typeof pt.lat === 'number' && pt.lon >= minLon && pt.lon <= maxLon && pt.lat >= minLat && pt.lat <= maxLat;
    console.log('directions: inBBox from=', inBBox(fromPt), 'to=', inBBox(toPt));
    if (!inBBox(fromPt) || !inBBox(toPt)) {
      return res.status(400).json({ message: 'From and To must be within the Southern California area (Santa Barbara -> Irvine).' });
    }
    let mapImageDataUrl = null;
    if (results.length > 0) {
      try {
        const first = results[0];

        const encoded = encodeURIComponent(first.geometry);

        const fromLonLatStr = `${fromPt.lon},${fromPt.lat}`;
        const toLonLatStr = `${toPt.lon},${toPt.lat}`;
        const centerLon = (fromPt.lon + toPt.lon) / 2;
        const centerLat = (fromPt.lat + toPt.lat) / 2;
        const toRad = (v) => (v * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(toPt.lat - fromPt.lat);
        const dLon = toRad(toPt.lon - fromPt.lon);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(fromPt.lat)) * Math.cos(toRad(toPt.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceMeters = R * c * 1000;
        const getZoomForDistance = (m) => {


          if (m > 200000) return 7;
          if (m > 100000) return 8;
          if (m > 50000) return 9;
          if (m > 20000) return 10;
          if (m > 10000) return 11;
          if (m > 5000) return 12;
          if (m > 2000) return 13;
          if (m > 1000) return 14;
          return 15;
        };

        let zoom = getZoomForDistance(distanceMeters) - 1;
        if (zoom < 7) zoom = 7;

        const staticUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/path-5+f44-0.6(${encoded}),pin-s-a+000(${fromLonLatStr}),pin-s-b+000(${toLonLatStr})/${centerLon},${centerLat},${zoom}/600x300?access_token=${token}`;
        const imgResp = await fetch(staticUrl);
        if (imgResp.ok) {
          const buffer = await imgResp.arrayBuffer();
          const b64 = Buffer.from(buffer).toString('base64');
          const contentType = imgResp.headers.get('content-type') || 'image/png';
          mapImageDataUrl = `data:${contentType};base64,${b64}`;
        }
      } catch (err) {
        console.warn('Failed to fetch static map image', err);
      }
    }

    try {
      const BASE = 1.65;
      const COST_PER_MIN = 0.24;
      const COST_PER_MILE = 1.16;

      const drivingRoutes = results.filter(r => r.profile === 'driving');
      if (drivingRoutes.length > 0) {
        let fastest = drivingRoutes[0];
        for (const r of drivingRoutes) {
          if (r.duration != null && fastest.duration != null && r.duration < fastest.duration) fastest = r;
        }

        const meters = Number(fastest.distance || 0);
        const seconds = Number(fastest.duration || 0);
        const miles = meters / 1609.34;
        const minutes = seconds / 60;

        const rawPrice = BASE + (COST_PER_MILE * miles) + (COST_PER_MIN * minutes);

        const price = Math.max(0, Math.round(rawPrice * 100) / 100);
        fastest.rideshareEstimate = `$${price.toFixed(2)}`;
      }
    } catch (e) {
      console.warn('Failed to compute local rideshare estimate', e);
    }

    // Compute safety score for each route by intersecting with cleanliness data in MongoDB
    try {
      // helper: decode Mapbox encoded polyline to [lon,lat] coords
      function decodePolyline(encoded) {
        if (!encoded) return [];
        let index = 0, lat = 0, lng = 0, coordinates = [];
        const length = encoded.length;
        while (index < length) {
          let b, shift = 0, result = 0;
          do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
          const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
          lat += deltaLat;
          shift = 0; result = 0;
          do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
          const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
          lng += deltaLng;
          coordinates.push([lng / 1e5, lat / 1e5]);
        }
        return coordinates;
      }

      // For each route, compute a distance-weighted average of cleanliness scores.
      // Strategy: iterate each consecutive coordinate pair of the route geometry, compute midpoint,
      // query which cleanliness feature (if any) contains that midpoint, and add the segment length
      // weighted by the matched feature's score. Finally divide by the total route distance.
      for (const route of results) {
        try {
          const geomEncoded = route.geometry;
          let coords = [];
          if (typeof geomEncoded === 'string') coords = decodePolyline(geomEncoded);
          else if (geomEncoded && geomEncoded.type === 'LineString' && Array.isArray(geomEncoded.coordinates)) coords = geomEncoded.coordinates;

          if (!coords || coords.length < 2) {
            route.safetyScore = null;
            route.safetyDescription = 'unknown';
            route.safetyMatchedCount = null;
            continue;
          }

          // Iterate segments and test midpoint containment against cleanliness geometries.
          let weightedSum = 0;
          let matchedDistance = 0;
          // Track raw CSGrade (1..3) sums separately so we can return a 1..3 distance-weighted average
          let weightedSumCSGradeRaw = 0;
          let matchedDistanceCSGrade = 0;
          let totalDistance = 0;
          let matchCounts = 0;

          // Build a list of segment midpoints to query, but decimate if extremely dense
          const segments = [];
          for (let i = 0; i < coords.length - 1; i++) {
            const a = coords[i];
            const b = coords[i + 1];
            const segLen = distanceMeters(a[1], a[0], b[1], b[0]);
            totalDistance += segLen;
            const mx = (a[0] + b[0]) / 2;
            const my = (a[1] + b[1]) / 2;
            // store endpoints as well so we can try segment intersection (preferred) before point lookups
            segments.push({ a, b, mx, my, segLen });
          }

          // If there are too many segments, sample every Nth to avoid very large query counts
          // We're defaulting to thorough per-segment matching (nearest neighbor) so we examine every road
          // but cap processing for extremely large routes by sampling when segments exceed MAX_SEGMENTS.
          const MAX_SEGMENTS = 1000; // higher cap for thorough processing
          const thorough = true; // default to per-segment thorough matching
          let sampleStep = 1;
          if (segments.length > MAX_SEGMENTS) sampleStep = Math.ceil(segments.length / MAX_SEGMENTS);
          const sampled = segments.filter((_, idx) => idx % sampleStep === 0);
          const debugMsgs = [];
          debugMsgs.push(`safety: totalSegments=${segments.length} sampleStep=${sampleStep} sampled=${sampled.length}`);
          if (req.query && req.query.debug === 'true') {
            const toShow = Math.min(3, sampled.length);
            for (let si = 0; si < toShow; si++) {
              const sseg = sampled[si];
              debugMsgs.push('safety: sample[' + si + ']= ' + JSON.stringify({ start: sseg.a, end: sseg.b }));
            }
            debugMsgs.push('safety: routeLine coordinates=' + JSON.stringify({ length: coords.length, first: coords[0], last: coords[coords.length-1] }));
          }

          // Helper to find a feature for a single point (tries intersects, near, then small bbox)
          async function findFeatureForPoint(seg) {
            if (!seg || typeof seg !== 'object') return null;
            // If thorough mode is requested, return the single nearest document via aggregation (no max distance)
            if (thorough) {
              try {
                const agg = await StreetCleanliness.aggregate([
                  { $geoNear: { near: { type: 'Point', coordinates: [seg.mx, seg.my] }, distanceField: 'dist', spherical: true } },
                  { $limit: 1 }
                ]).allowDiskUse(true).exec();
                if (agg && agg.length > 0) { const doc = agg[0]; doc._viaGeoNear = true; return doc; }
              } catch (e) {
                // fall through to other fallbacks if aggregation fails
              }
            }
            const pt = { type: 'Point', coordinates: [seg.mx, seg.my] };
            // Try point containment first (midpoint within a cleanliness geometry)
            try {
              const foundPt = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: pt } } }).lean();
              if (foundPt) { foundPt._viaPoint = true; return foundPt; }
            } catch (e) {}

            // Then try near/nearest searches with progressively larger radii to ensure we find the nearest road
            try {
              const radii = [50, 200, 1000, 5000];
              for (const r of radii) {
                try {
                  const found = await StreetCleanliness.findOne({ geometry: { $nearSphere: { $geometry: pt, $maxDistance: r } } }).lean();
                  if (found) { found._viaNearest = true; found._nearRadius = r; return found; }
                } catch (ne) {
                  // try the older $near if $nearSphere isn't supported in this environment
                  try {
                    const found2 = await StreetCleanliness.findOne({ geometry: { $near: { $geometry: pt, $maxDistance: r } } }).lean();
                    if (found2) { found2._viaNearest = true; found2._nearRadius = r; return found2; }
                  } catch (_) {}
                }
              }
              // As a last resort, return the nearest document regardless of distance
              try {
                const foundNear = await StreetCleanliness.findOne({ geometry: { $nearSphere: { $geometry: pt } } }).lean();
                if (foundNear) { foundNear._viaNearest = true; foundNear._nearRadius = null; return foundNear; }
              } catch (_) {}
            } catch (e) {}

            // Then try a small buffered bbox around the midpoint
            try {
              const BUF_METERS = 25;
              const metersPerDegLat = 111000;
              const metersPerDegLon = Math.abs(Math.cos(seg.my * Math.PI / 180) * 111000) || 111000;
              const latDelta = BUF_METERS / metersPerDegLat;
              const lonDelta = BUF_METERS / metersPerDegLon;
              const bboxPolyMid = {
                type: 'Polygon',
                coordinates: [[
                  [seg.mx - lonDelta, seg.my - latDelta],
                  [seg.mx - lonDelta, seg.my + latDelta],
                  [seg.mx + lonDelta, seg.my + latDelta],
                  [seg.mx + lonDelta, seg.my - latDelta],
                  [seg.mx - lonDelta, seg.my - latDelta]
                ]]
              };
              const foundBox = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: bboxPolyMid } } }).lean();
              if (foundBox) { foundBox._viaMidbox = true; return foundBox; }
            } catch (e) {}

            // Also try a buffered bbox around the full segment (covers long thin features near endpoints)
            try {
              if (seg && seg.a && seg.b) {
                const BUF_METERS_SEG = 50;
                const midLat = (seg.a[1] + seg.b[1]) / 2;
                const metersPerDegLatSeg = 111000;
                const metersPerDegLonSeg = Math.abs(Math.cos(midLat * Math.PI / 180) * 111000) || 111000;
                const latDeltaSeg = BUF_METERS_SEG / metersPerDegLatSeg;
                const lonDeltaSeg = BUF_METERS_SEG / metersPerDegLonSeg;
                const minLon = Math.min(seg.a[0], seg.b[0]) - lonDeltaSeg;
                const maxLon = Math.max(seg.a[0], seg.b[0]) + lonDeltaSeg;
                const minLat = Math.min(seg.a[1], seg.b[1]) - latDeltaSeg;
                const maxLat = Math.max(seg.a[1], seg.b[1]) + latDeltaSeg;
                const segBox = {
                  type: 'Polygon',
                  coordinates: [[
                    [minLon, minLat], [minLon, maxLat], [maxLon, maxLat], [maxLon, minLat], [minLon, minLat]
                  ]]
                };
                const foundSegBox = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: segBox } } }).lean();
                if (foundSegBox) { foundSegBox._viaSegBox = true; return foundSegBox; }
              }
            } catch (e) {}

            // Finally, as a fallback, try strict segment intersection (if DB geometries exactly align with segment)
            try {
              if (seg && seg.a && seg.b) {
                const segGeom = { type: 'LineString', coordinates: [ [seg.a[0], seg.a[1]], [seg.b[0], seg.b[1]] ] };
                const foundSeg = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: segGeom } } }).lean();
                if (foundSeg) { foundSeg._viaSegment = true; return foundSeg; }
              }
            } catch (segErr) {}

            return null;
          }

          // Run lookups in batches to parallelize but avoid overwhelming Mongo
          const BATCH_SIZE = 40;
          let sawLargeScore = false;
          for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
            const batch = sampled.slice(i, i + BATCH_SIZE);
            const promises = batch.map(s => findFeatureForPoint(s));
            debugMsgs.push(`safety: processing batch ${i/BATCH_SIZE + 1} batchSize=${batch.length}`);
            const resultsFound = await Promise.all(promises);
            // Map results back to segments: note we're using sampled segments only.
            for (let j = 0; j < batch.length; j++) {
              const seg = batch[j];
              const found = resultsFound[j];
                if (found) {
                let sRaw = null;
                let usedKey = null;
                if (found.properties) {
                  const p = found.properties;
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
                }

                // Normalize the raw score depending on the key found.
                // Heuristic: several datasets use a small integer cleanliness scale (1..3) even under keys
                // like `cleanliness` or `score`. Treat small integer 1..3 values as CSGrade-style (reciprocal)
                // so 1 -> best and 3 -> worst, mapping to 0..100, and avoid later double-scaling.
                let s = null;
                if (sRaw != null && !isNaN(Number(sRaw))) {
                  const num = Number(sRaw);
                  // Decide whether this should be treated as a CSGrade-like value
                  let treatAsCSGrade = false;
                  if (usedKey === 'CSGrade') treatAsCSGrade = true;
                  // Common dataset keys that may hold 1..3 categorical cleanliness scores
                  else if (usedKey === 'cleanliness' || usedKey === 'CSRoundSco' || usedKey === 'CSRoundScore' || usedKey === 'CSscor') {
                    if (Number.isInteger(num) && num >= 1 && num <= 3) treatAsCSGrade = true;
                  }
                  // As a fallback, if the numeric value is a small integer in 1..3, assume categorical scale
                  else if (Number.isInteger(num) && num >= 1 && num <= 3) {
                    treatAsCSGrade = true;
                  }

                  if (treatAsCSGrade) {
                    // CSGrade-like: 1..3 where lower is better. Convert via reciprocal normalization so 1 -> 100, 3 -> 0
                    const minG = 1.0;
                    const maxG = 3.0;
                    const recip = 1 / Math.max(0.0001, num);
                    const minRecip = 1 / maxG;
                    const maxRecip = 1 / minG;
                    const norm = (recip - minRecip) / Math.max(1e-6, (maxRecip - minRecip));
                    s = norm * 100;
                  } else {
                    // other numeric keys: use as-is (may be 0..1 fractional or 0..100)
                    s = num;
                  }
                }

                if (s != null) {
                  // if we encounter scores that are clearly on a 0-100 scale, remember that
                  if (typeof s === 'number' && s > 10) sawLargeScore = true;
                  weightedSum += s * seg.segLen;
                  matchedDistance += seg.segLen;
                  matchCounts += 1;
                  // If the original raw key was CSGrade, also accumulate the raw CSGrade value (1..3)
                  if (usedKey === 'CSGrade' && sRaw != null && !isNaN(Number(sRaw))) {
                    const rawNum = Number(sRaw);
                    weightedSumCSGradeRaw += rawNum * seg.segLen;
                    matchedDistanceCSGrade += seg.segLen;
                  }
                }
              }
            }
            debugMsgs.push(`safety: after batch ${i/BATCH_SIZE + 1} matchCounts=${matchCounts} matchedDistance=${matchedDistance.toFixed(1)}`);
          }

          // If nothing matched, as a last-resort try intersecting the entire route LineString
          if (matchedDistance === 0) {
            try {
              const routeLine = { type: 'LineString', coordinates: coords };
              debugMsgs.push('safety: no segment matches — trying whole-route intersection');
              const whole = await StreetCleanliness.findOne({ geometry: { $geoIntersects: { $geometry: routeLine } } }).lean();
              if (whole) {
                // use the found score across the whole route
                let sRaw = null;
                let usedKey = null;
                if (whole.properties) {
                  const p = whole.properties;
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
                }
                if (sRaw != null && !isNaN(Number(sRaw))) {
                  const num = Number(sRaw);
                  let s = null;
                  if (usedKey === 'CSGrade') {
                    const minG = 1.0; const maxG = 3.0;
                    const recip = 1 / Math.max(0.0001, num);
                    const minRecip = 1 / maxG; const maxRecip = 1 / minG;
                    const norm = (recip - minRecip) / Math.max(1e-6, (maxRecip - minRecip));
                    s = norm * 100;
                    // accumulate raw CSGrade too
                    weightedSumCSGradeRaw += num * totalDistance;
                    matchedDistanceCSGrade += totalDistance;
                  } else {
                    s = num;
                  }
                  weightedSum += s * totalDistance;
                  matchedDistance += totalDistance;
                  matchCounts += 1;
                  debugMsgs.push('safety: whole-route match used, key=' + usedKey + ' val=' + sRaw);
                }
              }
            } catch (wholeErr) {
              debugMsgs.push('safety: whole-route intersection failed: ' + (wholeErr && wholeErr.message));
            }
            // If whole-route intersection did not find any feature, and thorough mode requested,
            // perform an explicit per-segment nearest-neighbor fallback so every road contributes.
            if (matchedDistance === 0 && thorough) {
              debugMsgs.push('safety: performing per-segment nearest-neighbor fallback (thorough mode)');
              for (const seg of segments) {
                try {
                  const pt = { type: 'Point', coordinates: [seg.mx, seg.my] };
                  // find the nearest cleanliness doc (no maxDistance) as fallback
                  const nearDoc = await StreetCleanliness.findOne({ geometry: { $nearSphere: { $geometry: pt } } }).lean();
                  if (!nearDoc) continue;
                  // compute approximate distance between segment midpoint and the found doc's first coordinate
                  let docCoord = null;
                  if (nearDoc.geometry && nearDoc.geometry.type === 'LineString' && Array.isArray(nearDoc.geometry.coordinates) && nearDoc.geometry.coordinates.length > 0) docCoord = nearDoc.geometry.coordinates[0];
                  else if (nearDoc.geometry && nearDoc.geometry.type === 'Point') docCoord = nearDoc.geometry.coordinates;
                  if (!docCoord) continue;
                  const segDist = distanceMeters(seg.my, seg.mx, docCoord[1], docCoord[0]);
                  // distance penalty: closer docs contribute more; scale by 1/(1 + km)
                  const penalty = 1 / (1 + (segDist / 1000));

                  // extract raw score from nearDoc.properties (reuse existing logic)
                  let sRaw2 = null; let usedKey2 = null;
                  if (nearDoc.properties) {
                    const p = nearDoc.properties;
                    if (typeof p.score === 'number') { sRaw2 = p.score; usedKey2 = 'score'; }
                    else if (p.CSGrade != null) { sRaw2 = p.CSGrade; usedKey2 = 'CSGrade'; }
                    else if (p.CSRoundSco != null) { sRaw2 = p.CSRoundSco; usedKey2 = 'CSRoundSco'; }
                    else if (p.CSscor != null) { sRaw2 = p.CSscor; usedKey2 = 'CSscor'; }
                    else if (p.CSRoundScore != null) { sRaw2 = p.CSRoundScore; usedKey2 = 'CSRoundScore'; }
                    else if (p.cleanliness != null) { sRaw2 = p.cleanliness; usedKey2 = 'cleanliness'; }
                    else if (p.value != null) { sRaw2 = p.value; usedKey2 = 'value'; }
                    else if (p.raw) {
                      const raw = p.raw || {};
                      if (raw.CSGrade != null) { sRaw2 = raw.CSGrade; usedKey2 = 'CSGrade'; }
                      else if (raw.CSRoundSco != null) { sRaw2 = raw.CSRoundSco; usedKey2 = 'CSRoundSco'; }
                      else if (raw.CSscor != null) { sRaw2 = raw.CSscor; usedKey2 = 'CSscor'; }
                      else if (raw.CSRoundScore != null) { sRaw2 = raw.CSRoundScore; usedKey2 = 'CSRoundScore'; }
                      else if (raw.score != null) { sRaw2 = raw.score; usedKey2 = 'score'; }
                      else if (raw.cleanliness != null) { sRaw2 = raw.cleanliness; usedKey2 = 'cleanliness'; }
                      else if (raw.value != null) { sRaw2 = raw.value; usedKey2 = 'value'; }
                    }
                  }
                  if (sRaw2 == null || isNaN(Number(sRaw2))) continue;
                  // normalize score similar to main logic
                  let s2 = null;
                  const num2 = Number(sRaw2);
                  let treatAsCSGrade2 = false;
                  if (usedKey2 === 'CSGrade') treatAsCSGrade2 = true;
                  else if (usedKey2 === 'cleanliness' || usedKey2 === 'CSRoundSco' || usedKey2 === 'CSRoundScore' || usedKey2 === 'CSscor') {
                    if (Number.isInteger(num2) && num2 >= 1 && num2 <= 3) treatAsCSGrade2 = true;
                  } else if (Number.isInteger(num2) && num2 >= 1 && num2 <= 3) treatAsCSGrade2 = true;
                  if (treatAsCSGrade2) {
                    const minG = 1.0; const maxG = 3.0;
                    const recip = 1 / Math.max(0.0001, num2);
                    const minRecip = 1 / maxG; const maxRecip = 1 / minG;
                    const norm = (recip - minRecip) / Math.max(1e-6, (maxRecip - minRecip));
                    s2 = norm * 100;
                  } else {
                    s2 = num2;
                  }
                  // accumulate with segment length * penalty
                  weightedSum += s2 * seg.segLen * penalty;
                  matchedDistance += seg.segLen * penalty;
                  matchCounts += 1;
                  // accumulate CSGrade raw if present
                  if (usedKey2 === 'CSGrade') {
                    weightedSumCSGradeRaw += num2 * seg.segLen * penalty;
                    matchedDistanceCSGrade += seg.segLen * penalty;
                  }
                } catch (nnErr) {
                  // ignore per-seg NN failures
                }
              }
            }
          }

          // After all batches complete: if we only observed small fractional scores (e.g. 0..1), scale up to 0..100 once
          if (!sawLargeScore && matchedDistance > 0) {
            // weightedSum currently is sum(s_fraction * segLen); scale s by 100
            weightedSum = weightedSum * 100;
          }

          // Calculate weighted average by dividing weightedSum by total route distance, per your request.
          if (totalDistance <= 0) {
            route.safetyScore = null;
            route.safetyDescription = 'unknown';
            route.safetyMatchedCount = null;
          } else if (matchedDistance === 0) {
            route.safetyScore = null;
            route.safetyDescription = 'unknown';
            route.safetyMatchedCount = 0;
            if (req.query && req.query.debug === 'true') route.safetyDebug = debugMsgs;
          } else {
            const avgByTotal = weightedSum / totalDistance;
            // avgByTotal is currently on a 0..100 scale; convert to 0..1 where 1 is best
            const normalized01 = avgByTotal / 100;
            route.safetyScore = Math.round(normalized01 * 1000) / 1000; // three decimals
            if (route.safetyScore >= 0.75) route.safetyDescription = 'clean';
            else if (route.safetyScore >= 0.40) route.safetyDescription = 'moderate';
            else route.safetyDescription = 'dirty';

            // Compute a direct distance-weighted average in the original CSGrade scale (1..3)
            if (matchedDistanceCSGrade > 0) {
              const avgCSGrade = weightedSumCSGradeRaw / matchedDistanceCSGrade; // 1..3 (matched segments only)
              const avgCSGradeByRoute = weightedSumCSGradeRaw / totalDistance; // 1..3 scaled by route distance
              route.avgStreetScore = Math.round(avgCSGrade * 1000) / 1000;
              route.avgStreetScoreByRoute = Math.round(avgCSGradeByRoute * 1000) / 1000;
            } else {
              route.avgStreetScore = null;
              route.avgStreetScoreByRoute = null;
            }

            route.safetyMatchedCount = matchCounts;
            route.safetyMatchedDistance = Math.round(matchedDistance * 100) / 100; // meters
            if (req.query && req.query.debug === 'true') route.safetyDebug = debugMsgs;
          }
        } catch (e) {
          console.warn('Failed to compute route safety for a route', e);
          route.safetyScore = null;
          route.safetyDescription = 'unknown';
          route.safetyMatchedCount = null;
        }
      }
    } catch (e) {
      console.warn('Error computing route safety', e);
    }

    res.json({ routes: results, mapImage: mapImageDataUrl });
  } catch (err) {
    console.error('directions proxy error', err);
    res.status(500).json({ message: 'Failed to get directions' });
  }
};
