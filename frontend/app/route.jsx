import React, { useState, useEffect, useRef } from 'react';
import { Text, StyleSheet, ScrollView, View, TextInput, TouchableOpacity, ActivityIndicator, FlatList, Alert, Image, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './theme';
import { geocodeApi, getDirectionsApi, getMapboxTokenApi, getBusDirectionsApi } from '../api/api';

function buildMapHtml(token, initialPayload) {
  const safeToken = token || '';
  const init = initialPayload || 'null';
  // If there's no valid public token (or a secret token was provided), render a helpful message
  if (!safeToken || safeToken.indexOf('pk.') !== 0) {
    const masked = safeToken ? (safeToken.slice(0,4) + '...') : null;
    const secretNote = safeToken && safeToken.indexOf('sk.') === 0 ? '<p><strong>Note:</strong> the token provided appears to be a <code>secret</code> token (starts with <code>sk.</code>), which cannot be used by Mapbox GL.</p>' : '';
    return `<!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:20px;color:#333} .box{background:#fff;border:1px solid #eee;padding:16px;border-radius:8px;} code{display:inline-block;padding:2px 6px;background:#f6f8fa;border-radius:4px;}</style></head>
      <body>
        <div class="box">
          <h2>Mapbox token missing or invalid</h2>
          <p>Mapbox GL requires a <strong>public</strong> token that starts with <code>pk.</code>. No usable public token was provided to the map.</p>
          ${secretNote}
          <p>Please configure a public Mapbox token in your backend (the <code>/api/mapbox-token</code> endpoint) or set it in the frontend. For development you can use a public token with limited scopes.</p>
          ${masked ? `<p>Current token (masked): <code>${masked}</code></p>` : ''}
        </div>
      </body>
    </html>`;
  }

  return `<!doctype html>
  <html>
  <head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.css" rel="stylesheet" />
    <style>html,body,#map{height:100%;margin:0;padding:0;} .marker-label{background:#fff;padding:2px 6px;border-radius:4px;font-size:12px;border:1px solid #eee;box-shadow:0 1px 2px #ccc;}</style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.js"></script>
    <script src="https://unpkg.com/@mapbox/polyline@1.1.1/src/polyline.js"></script>
    <script>
      // Forward console logs/errors from WebView to React Native
      (function(){
        function send(obj){ try { if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e){} }
        const oldLog = console.log.bind(console);
        console.log = function(){ oldLog.apply(console, arguments); try { send({ type: 'console', level: 'log', args: Array.from(arguments) }); } catch(e){} };
        const oldErr = console.error.bind(console);
        console.error = function(){ oldErr.apply(console, arguments); try { send({ type: 'console', level: 'error', args: Array.from(arguments) }); } catch(e){} };
        window.addEventListener('error', function(ev){ try { send({ type: 'error', message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: ev.error && ev.error.stack }); } catch(e){} });
      })();
      mapboxgl.accessToken = '${safeToken}';
      const map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v11', center: [-118.2437,34.0522], zoom: 10, interactive: true });

      function sendReady(){ if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' })); } }
      map.on('load', sendReady);

      // Delay initial payload rendering until after map load
      const __INIT_PAYLOAD = ${init};
      map.on('load', function() {
        sendReady();
        if (__INIT_PAYLOAD && __INIT_PAYLOAD.type === 'routes') {
          try { renderRoutes(__INIT_PAYLOAD); } catch (e) { console.warn('init render failed', e); }
        }
      });

      function clearAllRoutes() {
        // Only proceed if map.getStyle() is available and valid
        const style = map.getStyle && map.getStyle();
        if (!style) return;
        const layers = style.layers || [];
        for (const l of layers) {
          if (l.id && l.id.indexOf('route-layer-') === 0) {
            try { if (map.getLayer(l.id)) map.removeLayer(l.id); } catch (e) {}
          }
        }
        const srcs = Object.keys(style.sources || {});
        for (const s of srcs) {
          if (s.indexOf('route-source-') === 0) {
            try { if (map.getLayer(s)) map.removeLayer(s); } catch (e) {}
            try { if (map.getSource(s)) map.removeSource(s); } catch (e) {}
          }
        }
        if (window.fromMarker) { window.fromMarker.remove(); window.fromMarker = null; }
        if (window.toMarker) { window.toMarker.remove(); window.toMarker = null; }
      }

      function renderRoutes(data) {
        try {
          clearAllRoutes();
          const pinColor = '#a78bfa';
          if (data.from) {
            if (window.fromMarker) window.fromMarker.remove();
            window.fromMarker = new mapboxgl.Marker({ color: pinColor })
              .setLngLat([data.from[0], data.from[1]])
              .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('A'))
              .addTo(map);
          }
          if (data.to) {
            if (window.toMarker) window.toMarker.remove();
            window.toMarker = new mapboxgl.Marker({ color: pinColor })
              .setLngLat([data.to[0], data.to[1]])
              .setPopup(new mapboxgl.Popup({ offset: 25 }).setText('B'))
              .addTo(map);
          }

          const allCoords = [];
          if (Array.isArray(data.routes)) {
            data.routes.forEach((r, idx) => {
              try {
                let coords = [];
                if (typeof r.geometry === 'string' && r.geometry.length > 0) {
                  try {
                    coords = polyline.decode(r.geometry).map(c => [c[1], c[0]]);
                  } catch (e) { coords = []; }
                } else if (r.geometry && r.geometry.type === 'LineString' && Array.isArray(r.geometry.coordinates)) {
                  coords = r.geometry.coordinates;
                } else if (r.legs && r.legs.length > 0) {
                  for (const leg of r.legs) {
                    const pts = leg.legGeometry && leg.legGeometry.points;
                    if (typeof pts === 'string' && pts.length > 0) {
                      try {
                        const dec = polyline.decode(pts).map(c => [c[1], c[0]]);
                        coords.push(...dec);
                      } catch (e) { }
                    }
                  }
                }
                if (!coords || coords.length === 0) {
                  return;
                }
                allCoords.push(...coords);
                const routeKey = r.key || r._busKey || r._driveKey || idx;
                const srcId = 'route-source-' + routeKey;
                const layerId = 'route-layer-' + routeKey;
                if (map.getLayer(layerId)) {
                  try { map.removeLayer(layerId); } catch (e) {}
                }
                if (map.getSource(srcId)) {
                  try { map.removeSource(srcId); } catch (e) {}
                }
                map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
                let color = '#7c3aed'; // default purple
                if (r.profile === 'driving') color = '#7c3aed';
                else if (r.profile === 'bus') color = '#ec4899'; // pink for bus
                else if (r.profile === 'walking') color = '#a78bfa';
                let highlight = false;
                const sel = data.selectedProfile != null ? String(data.selectedProfile) : null;
                const rk = String(routeKey);
                if (!sel) {
                  highlight = true;
                } else if (sel === rk) {
                  highlight = true;
                }
                map.addLayer({
                  id: layerId,
                  type: 'line',
                  source: srcId,
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': color,
                    'line-width': highlight ? 7 : 3,
                    'line-opacity': highlight ? 1 : 0.5
                  }
                });
              } catch (e) { console.warn('route render error', e); }
            });
          }

          const boundsPts = [];
          if (data.from) boundsPts.push([data.from[0], data.from[1]]);
          if (data.to) boundsPts.push([data.to[0], data.to[1]]);
          if (allCoords.length > 0) boundsPts.push(...allCoords);
          if (boundsPts.length > 0) {
            const bounds = boundsPts.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(boundsPts[0], boundsPts[0]));
            map.fitBounds(bounds, { padding: 20, maxZoom: 14 });
          }
        } catch (e) { console.warn('renderRoutes error', e); }
      }

      document.addEventListener('message', function(e) { try { const d = JSON.parse(e.data); if (d.type === 'routes') renderRoutes(d); } catch (err) {} });
      window.addEventListener('message', function(e) { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d.type === 'routes') renderRoutes(d); } catch (err) {} });
    </script>
  </body>
  </html>`;
}

export default function RouteScreen() {
  const [userName, setUserName] = useState('');
  const [userSafetyPref, setUserSafetyPref] = useState(10); 
  const [userFootPref, setUserFootPref] = useState(10); 
  const [userSpeedPref, setUserSpeedPref] = useState(10);
  const [userCostPref, setUserCostPref] = useState(10);
  const [userCrimePref, setUserCrimePref] = useState(10);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suppressFromUntil, setSuppressFromUntil] = useState(0);
  const [suppressToUntil, setSuppressToUntil] = useState(0);
  const [routes, setRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [mapboxToken, setMapboxToken] = useState(null);
  const webviewRef = useRef(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [mapImage, setMapImage] = useState(null);

  useEffect(() => { (async () => { try { const ud = await AsyncStorage.getItem('@user_data'); if (ud) { const parsed = JSON.parse(ud); setUserName(parsed.name || parsed.username || ''); } } catch (_e) {} })(); }, []);

  useEffect(() => { (async () => {
    try {
      const ud = await AsyncStorage.getItem('@user_data');
      if (!ud) return;
      const parsed = JSON.parse(ud);

      const pref = parsed?.preferences?.cleanliness ?? parsed?.cleanliness ?? null;
      if (pref != null) setUserSafetyPref(Number(pref));
      const footPref = parsed?.preferences?.footTraffic ?? parsed?.footTraffic ?? null;
      if (footPref != null) setUserFootPref(Number(footPref));
      const speedPref = parsed?.preferences?.speed ?? parsed?.speed ?? null;
      if (speedPref != null) setUserSpeedPref(Number(speedPref));
      const costPref = parsed?.preferences?.cost ?? parsed?.cost ?? null;
      if (costPref != null) setUserCostPref(Number(costPref));
      const crimePref = parsed?.preferences?.crime ?? parsed?.crime ?? null;
      if (crimePref != null) setUserCrimePref(Number(crimePref));
    } catch (_e) { }
  })(); }, []);

  useEffect(() => {
    let t = null;
    if (fromText && fromText.length > 1 && Date.now() > suppressFromUntil) {
      t = setTimeout(async () => {
        const r = await geocodeApi(fromText);
        const BBOX = { minLon: -119.9, minLat: 33.5, maxLon: -117.4, maxLat: 34.6 };
        const filtered = (r.suggestions || []).filter(s => { if (!s.center || s.center.length !== 2) return false; const [lon, lat] = s.center; return lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat; });
        setFromSuggestions(filtered);
        setLoadingSuggestions(false);
      }, 450);
    } else {
      setFromSuggestions([]);
    }

    return () => clearTimeout(t);
  }, [fromText, suppressFromUntil]);

  useEffect(() => {
    let t = null;
    if (toText && toText.length > 1 && Date.now() > suppressToUntil) {
      setLoadingSuggestions(true);
      t = setTimeout(async () => {
        const r = await geocodeApi(toText);
        const BBOX = { minLon: -119.9, minLat: 33.5, maxLon: -117.4, maxLat: 34.6 };
        const filtered = (r.suggestions || []).filter(s => { if (!s.center || s.center.length !== 2) return false; const [lon, lat] = s.center; return lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat; });
        setToSuggestions(filtered);
        setLoadingSuggestions(false);
      }, 450);
    } else {
      setToSuggestions([]);
    }
    return () => clearTimeout(t);
  }, [toText, suppressToUntil]);

  const pickFromSuggestion = (s) => { setFromText(s.place_name); if (s.center && s.center.length === 2) setFromCoords(s.center); setFromSuggestions([]); setSuppressFromUntil(Date.now() + 1000); };
  const pickToSuggestion = (s) => { setToText(s.place_name); if (s.center && s.center.length === 2) setToCoords(s.center); setToSuggestions([]); setSuppressToUntil(Date.now() + 1000); };
  const swapFromTo = () => { const aText = fromText; const aCoords = fromCoords; setFromText(toText); setFromCoords(toCoords); setToText(aText); setToCoords(aCoords); setRoutes([]); };

  useEffect(() => {
    const fetchRoutes = async () => {
      if (!fromCoords || !toCoords) return;
      setLoadingRoutes(true);
      setSelectedProfile(null);
      try {
        const from = `${fromCoords[0]},${fromCoords[1]}`;
        const to = `${toCoords[0]},${toCoords[1]}`;

        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 8);

        const res = await getDirectionsApi(from, to, ['driving']);
        const busRes = await getBusDirectionsApi(from, to, date, time);
        // Build grouped route cards: 1 rideshare (synthetic) if available, up to 2 driving, up to 2 bus
        const raw = [];
        if (res && Array.isArray(res.routes)) raw.push(...res.routes);
        if (busRes && Array.isArray(busRes.routes)) {
          // normalize bus results
          busRes.routes.slice(0, 3).forEach((r, idx) => {
            r.profile = 'bus';
            r._busKey = `bus${idx}`;
            if (!r.geometry && r.legs && r.legs.length > 0) r.geometry = r.legs[0].legGeometry?.points || '';
            raw.push(r);
          });
        }

        const driving = raw.filter(r => r.profile === 'driving').sort((a, b) => (a.duration || 0) - (b.duration || 0));
        const bus = raw.filter(r => r.profile === 'bus');

        const grouped = [];
        if (driving.length > 0 && driving[0].rideshareEstimate != null) {
          const best = driving[0];
          // keep the driving card; create a separate rideshare card derived from the same fastest route
          grouped.push({ ...best, profile: 'rideshare', key: 'rideshare' });
        }
        grouped.push(...driving.slice(0, 2));
        grouped.push(...bus.slice(0, 2));

        if (grouped.length > 0) {
          // ensure keys exist
          const withKeys = grouped.map((r, i) => { if (!r.key) r.key = r._busKey || r._driveKey || (`route${i}`); return r; });
          setRoutes(withKeys);
          if (res.mapImage) setMapImage(res.mapImage);
          // send original raw routes to WebView for rendering
          const payload = { type: 'routes', from: fromCoords, to: toCoords, routes: raw };
          if (webviewReady && webviewRef.current) {
            try { webviewRef.current.postMessage(JSON.stringify(payload)); } catch (_e) {}
          } else {
            setPendingPayload(payload);
          }
        } else {
          setRoutes([]);
        }
      } catch (err) {
        console.error('fetchRoutes error', err);
        setRoutes([]);
      } finally {
        setLoadingRoutes(false);
      }
    };
    fetchRoutes();
  }, [fromCoords, toCoords]);

  useEffect(() => {
    if (!fromCoords || !toCoords || !routes || routes.length === 0) return;

    const missing = routes.filter(r => (r.profile === 'driving') && r.safetyScore == null && !r._safetyFetchInProgress && !r._safetyFetchTried);
    if (missing.length === 0) return;

    setRoutes(prev => prev.map(p => ((p.profile === 'driving') && p.safetyScore == null) ? { ...p, _safetyFetchInProgress: true, _safetyFetchTried: true } : p));

    (async () => {
      try {
        const from = `${fromCoords[0]},${fromCoords[1]}`;
        const to = `${toCoords[0]},${toCoords[1]}`;
        const res = await getDirectionsApi(from, to, ['driving'], null, '&matchMode=thorough');
        if (res && Array.isArray(res.routes) && res.routes.length > 0) {

          for (const missingRoute of missing) {
            const candidates = res.routes.filter(x => x.profile === missingRoute.profile);
            if (candidates.length === 0) continue;
            let best = candidates[0];
            let bestDiff = Math.abs((best.distance || 0) - (missingRoute.distance || 0));
            for (const c of candidates) {
              const d = Math.abs((c.distance || 0) - (missingRoute.distance || 0));
              if (d < bestDiff) { best = c; bestDiff = d; }
            }

            setRoutes(prev => prev.map(p => {
              if (p.key === missingRoute.key) {
                return {
                  ...p,
                  safetyScore: best.safetyScore != null ? best.safetyScore : p.safetyScore,
                  safetyDescription: best.safetyDescription || p.safetyDescription,
                  avgStreetScore: best.avgStreetScore != null ? best.avgStreetScore : p.avgStreetScore,
                  safetyMatchedCount: best.safetyMatchedCount != null ? best.safetyMatchedCount : p.safetyMatchedCount,
                  safetyMatchedDistance: best.safetyMatchedDistance != null ? best.safetyMatchedDistance : p.safetyMatchedDistance,
                    _safetyFetchInProgress: false,
                    _safetyFetchTried: true
                };
              }
              return p;
            }));
          }
        }
      } catch (e) {
        console.warn('failed to fetch thorough safety for missing routes', e);
      } finally {
        setRoutes(prev => prev.map(p => (p._safetyFetchInProgress ? { ...p, _safetyFetchInProgress: false } : p)));
      }
    })();
  }, [routes, fromCoords, toCoords]);

  useEffect(() => { (async () => { try { const t = await getMapboxTokenApi(); console.log('[Route] mapbox token fetched:', t ? (typeof t === 'string' ? (t.slice(0,4) + '...') : String(t)) : 'null'); setMapboxToken(t); } catch (_e) { console.warn('[Route] failed to fetch mapbox token'); } })(); }, []);

  useEffect(() => { if (webviewReady && pendingPayload && webviewRef.current) { try { webviewRef.current.postMessage(JSON.stringify(pendingPayload)); } catch (_e) {} setPendingPayload(null); } }, [webviewReady, pendingPayload]);

  // Compute speed normalization bounds: min = fastest driving time, max = slowest bus time
  const drivingDurations = (routes || []).filter(r => r.profile === 'driving' || r.profile === 'rideshare').map(r => Number(r.duration || Infinity));
  const minDrivingTime = drivingDurations.length > 0 ? Math.min(...drivingDurations) : Infinity;
  const busDurations = (routes || []).filter(r => r.profile === 'bus').map(r => Number(r.duration || 0));
  const maxBusTime = busDurations.length > 0 ? Math.max(...busDurations) : 0;

  // Helper: compute yourScore for a route given the current routes list and user prefs
  function computeYourScoreForRoute(route, allRoutes) {
    // foot traffic
    const hasFootTrafficMiles = (route.footTrafficMatchedDistance != null && Number(route.footTrafficMatchedDistance) > 0) || (route.pedestrianTotal != null && Number(route.pedestrianTotal) > 0);
    let footTrafficScoreVal = null;
    if (hasFootTrafficMiles) {
      if (route.footTrafficScore != null) footTrafficScoreVal = Number(route.footTrafficScore);
      else if (route.pedestrianPerQuarterMile != null) footTrafficScoreVal = Math.max(0, Math.min(Number(route.pedestrianPerQuarterMile) / 20, 1));
      if (Number.isNaN(footTrafficScoreVal)) footTrafficScoreVal = null;
    }

    // base cleanliness/safety
    let baseSafetyVal = null;
    if (route.safetyScore != null) {
      const v = Number(route.safetyScore);
      if (!Number.isNaN(v)) baseSafetyVal = v;
    } else if (route.avgStreetScore != null) {
      const avg = Number(route.avgStreetScore);
      if (!Number.isNaN(avg) && avg <= 3) baseSafetyVal = (3 - avg) / 2;
      else if (!Number.isNaN(avg)) baseSafetyVal = Math.max(0, Math.min(avg, 100)) / 100;
    }

    // combined safety (cleanliness + foot traffic)
    let combinedSafetyVal = null;
    if (baseSafetyVal != null || footTrafficScoreVal != null) {
      const safetyW_local = Math.max(0, Math.min(Number(userSafetyPref || 10), 20)) / 20;
      const footW_local = Math.max(0, Math.min(Number(userFootPref || 10), 20)) / 20;
      if (baseSafetyVal != null && footTrafficScoreVal != null) {
        const denom = (safetyW_local + footW_local) || 1;
        combinedSafetyVal = (baseSafetyVal * safetyW_local + footTrafficScoreVal * footW_local) / denom;
      } else if (baseSafetyVal != null) combinedSafetyVal = baseSafetyVal;
      else combinedSafetyVal = footTrafficScoreVal;
    }

    // speed score using min driving and max bus from allRoutes
    const drivingDur = (allRoutes || []).filter(r => r.profile === 'driving' || r.profile === 'rideshare').map(r => Number(r.duration || Infinity));
    const minDrive = drivingDur.length > 0 ? Math.min(...drivingDur) : Infinity;
    const busDur = (allRoutes || []).filter(r => r.profile === 'bus').map(r => Number(r.duration || 0));
    const maxBus = busDur.length > 0 ? Math.max(...busDur) : 0;
    let speedScore = null;
    try {
      const dur = Number(route.duration || 0);
      const effectiveMax = (maxBus > 0) ? maxBus : (minDrive < Infinity ? (minDrive * 2) : dur || 1);
      const denom = Math.max(1, effectiveMax - (minDrive < Infinity ? minDrive : 0));
      speedScore = Math.max(0, Math.min(1, (effectiveMax - dur) / denom));
    } catch (e) { speedScore = null; }

    // cost score
    let costScore = null;
    try {
      if (route.profile === 'bus') costScore = 1;
      else if (route.profile === 'driving' || route.profile === 'rideshare') {
        const miles = (Number(route.distance || 0) / 1609.344) || 0;
        const cost = 0.6 * miles;
        const costNorm = Math.max(0, Math.min(cost, 50)) / 50;
        costScore = 1 - costNorm;
      }
    } catch (e) { costScore = null; }

    // combine per user prefs
    const safetyW_final = Math.max(0, Math.min(Number(userSafetyPref || 10), 20)) / 20;
    const speedW_final = Math.max(0, Math.min(Number(userSpeedPref || 10), 20)) / 20;
    const costW_final = Math.max(0, Math.min(Number(userCostPref || 10), 20)) / 20;
    const crimeW_final = Math.max(0, Math.min(Number(userCrimePref || 10), 20)) / 20;
    let finalScore = null;
    // Include crimeScore and lighting when present as additional dimensions (higher is better)
    const crimeScoreVal = route.crimeScore != null ? Number(route.crimeScore) : null;
    const lightingScoreVal = route.lightingScore != null ? Number(route.lightingScore) : null;
    // Build arrays for available scores and weights to compute weighted average robustly
    const components = [];
    const weights = [];
    if (combinedSafetyVal != null) { components.push(combinedSafetyVal); weights.push(safetyW_final); }
    if (speedScore != null) { components.push(speedScore); weights.push(speedW_final); }
    if (costScore != null) { components.push(costScore); weights.push(costW_final); }
    if (crimeScoreVal != null) { components.push(crimeScoreVal); weights.push(crimeW_final); }
    // lighting has a small default weight (0.1); include when present
    const lightingW_final = 0.1;
    if (lightingScoreVal != null) { components.push(lightingScoreVal); weights.push(lightingW_final); }
    const totalW = weights.reduce((s, v) => s + v, 0);
    if (components.length > 0 && totalW > 0) {
      let numer = 0;
      for (let i = 0; i < components.length; i++) numer += (components[i] * weights[i]);
      finalScore = numer / totalW;
    } else if (components.length > 0) {
      // fallback: average equally
      finalScore = components.reduce((s, v) => s + v, 0) / components.length;
    }

    return { yourScoreComputed: finalScore, combinedSafetyVal, speedScore, costScore };
  }

  // Sort routes by yourScore descending whenever routes or prefs change
  useEffect(() => {
    if (!routes || routes.length === 0) return;
    const withScores = routes.map(r => {
      const s = computeYourScoreForRoute(r, routes);
      return { ...r, _computedYourScore: s.yourScoreComputed };
    });
    console.log('[Route] computed scores:', withScores.map(rs => ({ key: rs.key || rs._busKey || rs._driveKey, score: rs._computedYourScore })));
    const sorted = withScores.slice().sort((a, b) => {
      const av = a._computedYourScore != null && !Number.isNaN(Number(a._computedYourScore)) ? Number(a._computedYourScore) : -1;
      const bv = b._computedYourScore != null && !Number.isNaN(Number(b._computedYourScore)) ? Number(b._computedYourScore) : -1;
      return bv - av;
    });
    console.log('[Route] sorted keys:', sorted.map(s => s.key || s._busKey || s._driveKey));
    // compare keys order to avoid infinite loops
    const same = sorted.length === routes.length && sorted.every((v, i) => (v.key || v._busKey || (v.profile + i)) === (routes[i].key || routes[i]._busKey || (routes[i].profile + i)));
    console.log('[Route] sort same as current?', same);
    if (!same) setRoutes(sorted);
  }, [routes, userSafetyPref, userFootPref, userSpeedPref, userCostPref, userCrimePref]);

  // Debug: log crime fields returned by backend so we can verify they're present
  useEffect(() => {
    if (!routes) return;
    try {
      console.log('[Route] routes crime fields:', routes.map(r => ({ key: r.key || r._busKey || r._driveKey || r.profile, crimeTotal: r.crimeTotal, crimeScore: r.crimeScore })));
    } catch (_e) {}
  }, [routes]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.header}>Start Your Journey, {userName || ''}!</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>From</Text>
          <TextInput value={fromText} onChangeText={setFromText} placeholder="Where from?" style={styles.input} />
          {loadingSuggestions && <ActivityIndicator size="small" color={colors.primary} />}
          {fromSuggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {fromSuggestions.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => pickFromSuggestion(s)} style={styles.suggestionItem}><Text>{s.place_name}</Text></TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.swapContainer}><TouchableOpacity style={styles.swapButton} onPress={swapFromTo}><Text style={{ fontSize: 18 }}>⇄</Text></TouchableOpacity></View>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>To</Text>
          <TextInput value={toText} onChangeText={setToText} placeholder="Where to?" style={styles.input} />
          {loadingSuggestions && <ActivityIndicator size="small" color={colors.primary} />}
          {toSuggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {toSuggestions.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => pickToSuggestion(s)} style={styles.suggestionItem}><Text>{s.place_name}</Text></TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.mapContainer}>
        {fromCoords && toCoords ? (
          Platform.OS === 'web' ? (
            (() => {
              const payload = JSON.stringify({ type: 'routes', from: fromCoords, to: toCoords, routes: routes || [], selectedProfile });
              return <iframe title="map" srcDoc={buildMapHtml(mapboxToken, payload)} style={{ width: '100%', height: '100%', border: 0 }} />;
            })()
          ) : (
            (() => {
              const payload = JSON.stringify({ type: 'routes', from: fromCoords, to: toCoords, routes: routes || [], selectedProfile });
              return <WebView
                ref={webviewRef}
                originWhitelist={["*"]}
                javaScriptEnabled={true}
                onMessage={(event) => {
                  try {
                    const m = JSON.parse(event.nativeEvent.data);
                    if (!m) return;
                    if (m.type === 'ready') {
                      setWebviewReady(true);
                      return;
                    }
                    if (m.type === 'console' && Array.isArray(m.args)) {
                      console.log('[WebView]', ...(m.args));
                    } else if (m.type === 'error') {
                      console.error('[WebView Error]', m);
                    } else {
                      console.log('[WebView message]', m);
                    }
                  } catch (_err) {
                    try { console.log('[WebView raw]', event.nativeEvent.data); } catch (_e) {}
                  }
                }}
                source={{ html: buildMapHtml(mapboxToken, payload) }}
                style={{ flex: 1 }}
              />;
            })()
          )
        ) : (
          mapImage ? (
            <Image source={{ uri: mapImage }} style={styles.mapImage} />
          ) : (
            <View style={styles.mapPlaceholder}><Text style={{ color: colors.textMuted }}>Map will appear here when both locations are set</Text></View>
          )
        )}
      </View>
      {/* No Highways toggle removed */}

      <View style={{ marginTop: 12 }}>
        <Text style={styles.sectionTitle}>Your Ranked Routes</Text>
        {loadingRoutes && <ActivityIndicator size="small" color={colors.primary} />}
        {!loadingRoutes && routes.length === 0 && <Text style={{ color: colors.textMuted }}>No routes available yet.</Text>}
        <FlatList
          data={routes}
          keyExtractor={(item, idx) => item.key || item._busKey || (item.profile + idx)}
          renderItem={({ item, index }) => {
            const key = item.key || item._busKey || (item.profile + index);
            const isSelected = selectedProfile === key;
            let label = item.profile.toUpperCase();
            let color = colors.primary;
            if (item.profile === 'bus') {
              label = `BUS ${item._busKey ? item._busKey.replace('bus','') : ''}`;
            }
            const footPrefMultiplier = Math.max(0, Math.min(Number(userFootPref || 0), 20)) / 20;
            const safetyW = Math.max(0, Math.min(Number(userSafetyPref || 10), 20)) / 20;
            const speedW = Math.max(0, Math.min(Number(userSpeedPref || 10), 20)) / 20;
            const hasFootTrafficMiles = (item.footTrafficMatchedDistance != null && Number(item.footTrafficMatchedDistance) > 0) || (item.pedestrianTotal != null && Number(item.pedestrianTotal) > 0);
            let footTrafficScoreVal = null;
            let footTrafficScoreDisplay = 'NA';
            if (hasFootTrafficMiles) {
              let sc = null;
              if (item.footTrafficScore != null) sc = Number(item.footTrafficScore);
              else if (item.pedestrianPerQuarterMile != null) sc = Math.max(0, Math.min(Number(item.pedestrianPerQuarterMile) / 20, 1));
              if (sc != null && !Number.isNaN(sc)) { footTrafficScoreVal = sc; footTrafficScoreDisplay = sc.toFixed(3); }
              else footTrafficScoreDisplay = 'NA';
            }

            let baseSafetyVal = null;
            if (item.safetyScore != null) {
              const v = Number(item.safetyScore);
              if (!Number.isNaN(v)) baseSafetyVal = v;
            } else if (item._safetyFetchInProgress) {

            } else if (item.avgStreetScore != null) {
              const avg = Number(item.avgStreetScore);
              if (!Number.isNaN(avg) && avg <= 3) {
                baseSafetyVal = (3 - avg) / 2;
              } else if (!Number.isNaN(avg)) {
                baseSafetyVal = Math.max(0, Math.min(avg, 100)) / 100;
              }
            }

            let combinedSafetyVal = null;
            // Combine cleanliness (baseSafetyVal) and foot-traffic when available.
            // If both exist, compute a weighted average using user prefs; otherwise fall back to whichever exists.
            if (baseSafetyVal != null || footTrafficScoreVal != null) {
              const safetyW = Math.max(0, Math.min(Number(userSafetyPref || 10), 20)) / 20;
              const footW = Math.max(0, Math.min(Number(userFootPref || 10), 20)) / 20;
              if (baseSafetyVal != null && footTrafficScoreVal != null) {
                const denom = (safetyW + footW) || 1;
                combinedSafetyVal = (baseSafetyVal * safetyW + footTrafficScoreVal * footW) / denom;
              } else if (baseSafetyVal != null) {
                combinedSafetyVal = baseSafetyVal;
              } else {
                combinedSafetyVal = footTrafficScoreVal;
              }
            }

            let safetyDisplay = '—';
            if (combinedSafetyVal != null) {
              safetyDisplay = Number(combinedSafetyVal).toFixed(3);
            } else if (item._safetyFetchInProgress) {
              safetyDisplay = 'Fetching...';
            }

            // Compute speed score: normalize with min driving and max bus times
            let speedScore = null;
            try {
              const dur = Number(item.duration || 0);
              // fallback: if no bus durations, use a max that's twice the min driving time
              const effectiveMax = (maxBusTime > 0) ? maxBusTime : (minDrivingTime < Infinity ? (minDrivingTime * 2) : dur || 1);
              const denom = Math.max(1, effectiveMax - (minDrivingTime < Infinity ? minDrivingTime : 0));
              speedScore = Math.max(0, Math.min(1, (effectiveMax - dur) / denom));
            } catch (e) { speedScore = null; }

            // Compute cost score: bus cost = $0, driving cost = $0.60 * miles
            let costScore = null;
            try {
              if (item.profile === 'bus') {
                costScore = 1; // free or included
              } else if (item.profile === 'driving' || item.profile === 'rideshare') {
                const miles = (Number(item.distance || 0) / 1609.344) || 0;
                const cost = 0.6 * miles;
                const costNorm = Math.max(0, Math.min(cost, 50)) / 50;
                costScore = 1 - costNorm;
              }
            } catch (e) { costScore = null; }

            // Use the canonical computed score (the same value used by the sorter)
            const canonical = computeYourScoreForRoute(item, routes);
            let yourScore = canonical && canonical.yourScoreComputed != null && !Number.isNaN(Number(canonical.yourScoreComputed))
              ? Number(canonical.yourScoreComputed)
              : null;
            // Rideshare-specific combined score: incorporate cleanliness and foot-traffic (from the driving route)
            // and weight with user cost preference. Display as a decimal 0..1.
            let rideshareYourScore = null;
            if (item.profile === 'rideshare') {
              const costPref = Math.max(0, Math.min(Number(userCostPref || 10), 20)) / 20; // 0..1 where 1 means cost matters more
              // Parse rideshare cost which may be a string like "$12.34"
              let cost = null;
              if (item.rideshareEstimate != null) {
                if (typeof item.rideshareEstimate === 'number') cost = item.rideshareEstimate;
                else {
                  const m = String(item.rideshareEstimate).match(/[\d,.]+/);
                  if (m && m[0]) cost = parseFloat(m[0].replace(/,/g, ''));
                }
              }
              const costNorm = cost != null && !Number.isNaN(cost) ? Math.max(0, Math.min(cost, 50)) / 50 : 1;
              const costScore = 1 - costNorm; // 0..1 where higher is better

              // cleanliness (safety) and foot traffic scores (0..1) — use values already computed for this item
              const cleanlinessScore = baseSafetyVal != null ? baseSafetyVal : null;
              const footScore = footTrafficScoreVal != null ? footTrafficScoreVal : null;
              // Weigh cleanliness vs footTraffic using user prefs
              const safetyW = Math.max(0, Math.min(Number(userSafetyPref || 10), 20)) / 20;
              const footW = Math.max(0, Math.min(Number(userFootPref || 10), 20)) / 20;

              let safetyCombined = null;
              if (cleanlinessScore != null || footScore != null) {
                if (cleanlinessScore == null) safetyCombined = footScore;
                else if (footScore == null) safetyCombined = cleanlinessScore;
                else {
                  const denom = (safetyW + footW) || 1;
                  safetyCombined = (cleanlinessScore * safetyW + footScore * footW) / denom;
                }
              }

              // incorporate speed into the rideshare score as well
              const otherDenom = (safetyW + speedW) || 1;
              let otherCombined = null;
              if (safetyCombined != null && speedScore != null) otherCombined = ((safetyCombined * safetyW) + (speedScore * speedW)) / otherDenom;
              else if (safetyCombined != null) otherCombined = safetyCombined;
              else if (speedScore != null) otherCombined = speedScore;

              // incorporate lighting into rideshare score with a small default weight
              const lightingScoreItem = item.lightingScore != null ? Number(item.lightingScore) : null;
              const lightingW = 0.1;
              let otherWithLighting = otherCombined;
              if (lightingScoreItem != null) {
                if (otherCombined != null) otherWithLighting = ((1 - lightingW) * otherCombined) + (lightingW * lightingScoreItem);
                else otherWithLighting = lightingScoreItem;
              }

              if (otherWithLighting != null) {
                rideshareYourScore = (costPref * costScore) + ((1 - costPref) * otherWithLighting);
              } else {
                rideshareYourScore = costScore;
              }
            }
            return (
              <View style={[styles.routeCard, isSelected && styles.routeCardSelected]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                    try {
                      const newSelected = isSelected ? null : key;
                      const payload = { type: 'routes', from: fromCoords, to: toCoords, routes: routes, selectedProfile: newSelected };
                      if (webviewReady && webviewRef.current) webviewRef.current.postMessage(JSON.stringify(payload)); else setPendingPayload(payload);
                      setSelectedProfile(newSelected);
                    } catch (_err) { console.warn('failed to post route to webview', _err); }
                  }}>
                    <Text style={[styles.routeProfile, { color }]}>{label}</Text>
                    <Text style={{ color: colors.textMuted }}>{(item.distance/1609.344).toFixed(1)} mi • {(item.duration/60).toFixed(0)} min</Text>
                    {item.profile === 'bus' && item.summary && (
                      <Text style={{ color: '#ec4899', fontWeight: '700', marginTop: 4 }}>{item.summary}</Text>
                    )}
                    {item.profile === 'driving' && (
                      <View style={{ marginTop: 6 }}>
                        {item.avgStreetScore != null && (
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Avg street score: {Number(item.avgStreetScore).toFixed(2)} (1=best, 3=worst)</Text>
                        )}
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                          Foot traffic score: {footTrafficScoreDisplay}
                          {hasFootTrafficMiles ? (` • Pedestrians: ${item.pedestrianTotal != null ? item.pedestrianTotal : '—'} • /qmi: ${item.pedestrianPerQuarterMile != null ? Number(item.pedestrianPerQuarterMile).toFixed(3) : '—'}`) : ''}
                        </Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Cleanliness: {safetyDisplay} {item.safetyDescription ? '• ' + item.safetyDescription : ''}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Crime: {item.crimeTotal != null ? item.crimeTotal : '—'} • score: {item.crimeScore != null ? Number(item.crimeScore).toFixed(3) : '—'}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Lighting: {item.lampCount != null ? item.lampCount : '—'} • /qmi: {item.lampsPerQuarter != null ? Number(item.lampsPerQuarter).toFixed(3) : '—'}</Text>
                        {yourScore != null && (
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Your Score: {Number(yourScore).toFixed(3)}</Text>
                        )}
                      </View>
                    )}

                    {item.profile === 'bus' && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                          Foot traffic score: {footTrafficScoreDisplay}
                          {hasFootTrafficMiles ? (` • Pedestrians: ${item.pedestrianTotal != null ? item.pedestrianTotal : '—'} • /qmi: ${item.pedestrianPerQuarterMile != null ? Number(item.pedestrianPerQuarterMile).toFixed(3) : '—'}`) : ''}
                        </Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Cleanliness: {safetyDisplay} {item.safetyDescription ? '• ' + item.safetyDescription : ''}</Text>
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Crime: {item.crimeTotal != null ? item.crimeTotal : '—'} • score: {item.crimeScore != null ? Number(item.crimeScore).toFixed(3) : '—'}</Text>
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Lighting: {item.lampCount != null ? item.lampCount : '—'} • /qmi: {item.lampsPerQuarter != null ? Number(item.lampsPerQuarter).toFixed(3) : '—'}</Text>
                        {yourScore != null && (
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Your Score: {Number(yourScore).toFixed(3)}</Text>
                        )}
                      </View>
                    )}

                    {item.profile === 'rideshare' && (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Rideshare: {item.rideshareEstimate != null ? (typeof item.rideshareEstimate === 'string' ? item.rideshareEstimate : ('$' + Number(item.rideshareEstimate).toFixed(2))) : '—'}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                          Foot traffic score: {footTrafficScoreDisplay}
                          {hasFootTrafficMiles ? (` • Pedestrians: ${item.pedestrianTotal != null ? item.pedestrianTotal : '—'} • /qmi: ${item.pedestrianPerQuarterMile != null ? Number(item.pedestrianPerQuarterMile).toFixed(3) : '—'}`) : ''}
                        </Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Cleanliness: {safetyDisplay} {item.safetyDescription ? '• ' + item.safetyDescription : ''}</Text>
                          <Text style={{ color: colors.textMuted, marginTop: 4 }}>Crime: {item.crimeTotal != null ? item.crimeTotal : '—'} • score: {item.crimeScore != null ? Number(item.crimeScore).toFixed(3) : '—'}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Lighting: {item.lampCount != null ? item.lampCount : '—'} • /qmi: {item.lampsPerQuarter != null ? Number(item.lampsPerQuarter).toFixed(3) : '—'}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Your Score: {rideshareYourScore != null ? Number(rideshareYourScore).toFixed(3) : '—'}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={{ width: 120, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => { Alert.alert('Start Route', `Starting ${label} route (stub).`); }} style={styles.goButton}><Text style={styles.goButtonText}>Go</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { Alert.alert(label, `Distance: ${(item.distance/1609.344).toFixed(2)} mi\nDuration: ${(item.duration/60).toFixed(1)} min`); }} style={styles.detailsButton}><Text style={styles.detailsButtonText}>Details</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { fontSize: 22, fontWeight: '800', color: colors.primary, marginBottom: 12, paddingHorizontal: 2 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  label: { color: colors.textMuted, marginBottom: 6, fontWeight: '700' },
  input: { backgroundColor: colors.offWhite, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder },
  swapContainer: { justifyContent: 'center', alignItems: 'center', paddingTop: 20 },
  swapButton: { backgroundColor: colors.cardBg, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder },
  suggestionsBox: { backgroundColor: 'white', borderRadius: 8, marginTop: 6, borderWidth: 1, borderColor: colors.lightBorder, maxHeight: 200 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  mapContainer: { marginTop: 12, height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.cardBg },
  mapImage: { width: '100%', height: '100%' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontWeight: '800', marginBottom: 8, color: colors.primary },
  routeCard: { backgroundColor: colors.cardBg, padding: 12, borderRadius: 8, marginBottom: 8 },
  routeProfile: { fontWeight: '800', marginBottom: 4 },
  routeCardSelected: { borderWidth: 2, borderColor: colors.primary },
  goButton: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginBottom: 6 },
  goButtonText: { color: 'white', fontWeight: '800' },
  detailsButton: { backgroundColor: colors.track, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  detailsButtonText: { color: colors.textDark, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, justifyContent: 'flex-start' },
  toggleLabel: { fontWeight: '700', fontSize: 16, marginRight: 12, color: colors.primary },
  toggleButton: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1, marginLeft: 4 },
  toggleButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleButtonInactive: { backgroundColor: colors.cardBg, borderColor: colors.lightBorder },
  toggleText: { fontWeight: '700', fontSize: 15 },
  toggleTextActive: { color: 'white' },
  toggleTextInactive: { color: colors.textMuted }
});