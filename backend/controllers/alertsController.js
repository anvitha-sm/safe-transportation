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

    res.json({ routes: results, mapImage: mapImageDataUrl });
  } catch (err) {
    console.error('directions proxy error', err);
    res.status(500).json({ message: 'Failed to get directions' });
  }
};
