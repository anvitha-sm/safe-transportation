import React, { useState, useEffect, useRef } from 'react';
import { Text, StyleSheet, ScrollView, View, TextInput, TouchableOpacity, ActivityIndicator, FlatList, Alert, Image, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './theme';
import { geocodeApi, getDirectionsApi, getMapboxTokenApi, getBusDirectionsApi } from '../api/api';

function buildMapHtml(token, initialPayload) {
  const safeToken = token || '';
  const init = initialPayload || 'null';
  // If a secret token is provided, return a helpful HTML page instead of trying to init Mapbox GL.
  if (safeToken.indexOf('sk.') === 0) {
    return `<!doctype html>
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:20px;color:#333} .box{background:#fff;border:1px solid #eee;padding:16px;border-radius:8px;} code{display:inline-block;padding:2px 6px;background:#f6f8fa;border-radius:4px;}</style></head>
      <body>
        <div class="box">
          <h2>Mapbox token error</h2>
          <p>The Mapbox token provided appears to be a <strong>secret</strong> token (starts with <code>sk.</code>). Mapbox GL requires a <strong>public</strong> token that starts with <code>pk.</code>.</p>
          <p>Please provide a public token. For development you can use a public token with limited scopes. Update your backend or frontend configuration so the Mapbox GL client receives a <code>pk.*</code> token.</p>
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
          // Pin colors by route type
          // Use lighter purple for all pins
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
                // If geometry is an encoded polyline string
                if (typeof r.geometry === 'string' && r.geometry.length > 0) {
                  try {
                    coords = polyline.decode(r.geometry).map(c => [c[1], c[0]]);
                  } catch (e) { coords = []; }
                } else if (r.geometry && r.geometry.type === 'LineString' && Array.isArray(r.geometry.coordinates)) {
                  coords = r.geometry.coordinates;
                } else if (r.legs && r.legs.length > 0) {
                  // Try to assemble from legGeometry points
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
                  // Nothing to draw for this route
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
                // Color by route type
                let color = '#7c3aed'; // default purple
                if (r.profile === 'driving') color = '#7c3aed';
                else if (r.profile === 'bus') color = '#ec4899'; // pink for bus
                else if (r.profile === 'walking') color = '#a78bfa';
                // Highlight logic - match by route key
                let highlight = false;
                const sel = data.selectedProfile != null ? String(data.selectedProfile) : null;
                const rk = String(routeKey);
                // Highlight only when there's no selection or the selectedProfile matches this route's key
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

          // Fit bounds to all route coords and both markers
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

      // listen for messages from React Native
      document.addEventListener('message', function(e) { try { const d = JSON.parse(e.data); if (d.type === 'routes') renderRoutes(d); } catch (err) {} });
      window.addEventListener('message', function(e) { try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d.type === 'routes') renderRoutes(d); } catch (err) {} });
    </script>
  </body>
  </html>`;
}

export default function RouteScreen() {
  const [userName, setUserName] = useState('');
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
    // ...existing code...
  const [mapboxToken, setMapboxToken] = useState(null);
  const webviewRef = useRef(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [mapImage, setMapImage] = useState(null);

  useEffect(() => { (async () => { try { const ud = await AsyncStorage.getItem('@user_data'); if (ud) { const parsed = JSON.parse(ud); setUserName(parsed.name || parsed.username || ''); } } catch (_e) {} })(); }, []);

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
// ...existing code...
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
        // Get current date/time for routing
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 8);
        // Fetch driving/walking routes
        const res = await getDirectionsApi(from, to, ['driving','walking']);
        // Fetch bus routes
        const busRes = await getBusDirectionsApi(from, to, date, time);
        let allRoutes = [];
        if (res && Array.isArray(res.routes)) {
          // Limit driving routes to at most 3
          const driving = res.routes.filter(r => r.profile === 'driving');
          const other = res.routes.filter(r => r.profile !== 'driving');
          const drivingLimited = driving.slice(0, 3).map((r, idx) => {
            r._driveKey = `drive${idx}`;
            return r;
          });
          allRoutes = allRoutes.concat(drivingLimited).concat(other);
        }
        if (busRes && Array.isArray(busRes.routes)) {
          // Only keep up to three bus routes, mark with unique keys
          const busLimited = busRes.routes.slice(0, 3).map((r, idx) => {
            r.profile = 'bus';
            r._busKey = `bus${idx}`;
            // Defensive: try to populate geometry from legs if missing
            if (!r.geometry && r.legs && r.legs.length > 0) {
              r.geometry = r.legs[0].legGeometry?.points || '';
            }
            return r;
          });
          allRoutes = allRoutes.concat(busLimited);
        }
        if (allRoutes.length > 0) {
          // Ensure each route has a stable `key` used by the map and list
          allRoutes = allRoutes.map((r, i) => {
            if (!r.key) r.key = r._busKey || r._driveKey || (`route${i}`);
            return r;
          });
          setRoutes(allRoutes);
          if (res.mapImage) setMapImage(res.mapImage);
          const payload = { type: 'routes', from: fromCoords, to: toCoords, routes: allRoutes };
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
  }, [fromCoords, toCoords, webviewReady]);

  useEffect(() => { (async () => { try { const t = await getMapboxTokenApi(); console.log('[Route] mapbox token fetched:', t ? (typeof t === 'string' ? (t.slice(0,4) + '...') : String(t)) : 'null'); setMapboxToken(t); } catch (_e) { console.warn('[Route] failed to fetch mapbox token'); } })(); }, []);

  useEffect(() => { if (webviewReady && pendingPayload && webviewRef.current) { try { webviewRef.current.postMessage(JSON.stringify(pendingPayload)); } catch (_e) {} setPendingPayload(null); } }, [webviewReady, pendingPayload]);

  // ...existing code...
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
        {mapboxToken && fromCoords && toCoords ? (
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
                    // Forward any console/error messages from the WebView to React Native console
                    if (m.type === 'console' && Array.isArray(m.args)) {
                      console.log('[WebView]', ...(m.args));
                    } else if (m.type === 'error') {
                      console.error('[WebView Error]', m);
                    } else {
                      console.log('[WebView message]', m);
                    }
                  } catch (_err) {
                    // Some messages are plain strings
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
            return (
              <View style={[styles.routeCard, isSelected && styles.routeCardSelected]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                    try {
                      // Toggle selection: deselect if already selected
                      const newSelected = isSelected ? null : key;
                      // Normalize selection to the route's canonical key
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
