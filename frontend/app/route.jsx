import React, { useState, useEffect, useRef } from 'react';
import { Text, StyleSheet, ScrollView, View, TextInput, TouchableOpacity, ActivityIndicator, FlatList, Alert, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './theme';
import { geocodeApi, getDirectionsApi, getMapboxTokenApi } from '../api/api';
function buildMapHtml(token) {
  const safeToken = token || '';
  return `<!doctype html>
  <html>
  <head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
    <link href="https://api.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.css" rel="stylesheet" />
    <style>html,body,#map{height:100%;margin:0;padding:0;} </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://api.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.js"></script>
    <script src="https://unpkg.com/@mapbox/polyline@1.1.1/src/polyline.js"></script>
    <script>
      mapboxgl.accessToken = '${safeToken}';
      const map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-118.2437,34.0522],
        zoom: 10
      });

      function sendReady(){
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        }
      }
      map.on('load', sendReady);

      function clearRoute() {
        if (map.getLayer('route')) map.removeLayer('route');
        if (map.getSource('route')) map.removeSource('route');
      }

      function renderRoutes(data) {
        try {
          clearRoute();
          if (data.from) {
            if (window.fromMarker) window.fromMarker.remove();
            window.fromMarker = new mapboxgl.Marker({ color: '#2b9fef' }).setLngLat([data.from[0], data.from[1]]).addTo(map);
          }
          if (data.to) {
            if (window.toMarker) window.toMarker.remove();
            window.toMarker = new mapboxgl.Marker({ color: '#ef4036' }).setLngLat([data.to[0], data.to[1]]).addTo(map);
          }
          if (data.routes && data.routes.length > 0) {
            const geom = data.routes[0].geometry;
            const coords = polyline.decode(geom).map(c => [c[1], c[0]]);
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff6600', 'line-width': 4 } });
            const bounds = coords.reduce((b, coord) => b.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
            map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
          }
        } catch (e) {
          console.warn('renderRoutes error', e);
        }
      }
      document.addEventListener('message', function(e) {
        try { const d = JSON.parse(e.data); if (d.type === 'routes') renderRoutes(d); } catch (err) {}
      });
      window.addEventListener('message', function(e) {
        try { const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; if (d.type === 'routes') renderRoutes(d); } catch (err) {}
      });
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
  const [mapboxToken, setMapboxToken] = useState(null);
  const webviewRef = useRef(null);
  const [mapImage, setMapImage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const ud = await AsyncStorage.getItem('@user_data');
        if (ud) {
          const parsed = JSON.parse(ud);
          setUserName(parsed.name || parsed.username || '');
        }
      } catch (_e) {}
    })();
  }, []);
  useEffect(() => {
    let t = null;
    if (fromText && fromText.length > 1 && Date.now() > suppressFromUntil) {
      setLoadingSuggestions(true);
      t = setTimeout(async () => {
        const r = await geocodeApi(fromText);
        const BBOX = { minLon: -119.9, minLat: 33.5, maxLon: -117.4, maxLat: 34.6 };
        const filtered = (r.suggestions || []).filter(s => {
          if (!s.center || s.center.length !== 2) return false;
          const [lon, lat] = s.center;
          return lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;
        });
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
        const filtered = (r.suggestions || []).filter(s => {
          if (!s.center || s.center.length !== 2) return false;
          const [lon, lat] = s.center;
          return lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;
        });
        setToSuggestions(filtered);
        setLoadingSuggestions(false);
      }, 450);
    } else {
      setToSuggestions([]);
    }
    return () => clearTimeout(t);
  }, [toText, suppressToUntil]);

  const pickFromSuggestion = (s) => {
    setFromText(s.place_name);
    if (s.center && s.center.length === 2) setFromCoords(s.center);
    setFromSuggestions([]);
    setSuppressFromUntil(Date.now() + 1000);
  };

  const pickToSuggestion = (s) => {
    setToText(s.place_name);
    if (s.center && s.center.length === 2) setToCoords(s.center);
    setToSuggestions([]);
    setSuppressToUntil(Date.now() + 1000);
  };

  const swapFromTo = () => {
    const aText = fromText;
    const aCoords = fromCoords;
    setFromText(toText);
    setFromCoords(toCoords);
    setToText(aText);
    setToCoords(aCoords);
    setRoutes([]);
  };
  useEffect(() => {
    const fetchRoutes = async () => {
      if (!fromCoords || !toCoords) return;
      setLoadingRoutes(true);
      setSelectedProfile(null);
      try {
        const from = `${fromCoords[0]},${fromCoords[1]}`;
        const to = `${toCoords[0]},${toCoords[1]}`;
        const res = await getDirectionsApi(from, to, ['driving','walking']);
        if (res) {
          setRoutes(res.routes || []);
          if (res.mapImage) setMapImage(res.mapImage);
          if (webviewRef.current && res.routes && res.routes.length > 0) {
            try {
              const payload = { type: 'routes', from: fromCoords, to: toCoords, routes: res.routes };
              webviewRef.current.postMessage(JSON.stringify(payload));
            } catch (_e) {
            }
          }
        }
      } catch (err) {
        console.error('fetchRoutes error', err);
      } finally {
        setLoadingRoutes(false);
      }
    };
    fetchRoutes();
  }, [fromCoords, toCoords]);
  useEffect(() => {
    (async () => {
      try {
        const t = await getMapboxTokenApi();
        setMapboxToken(t);
      } catch (_e) {}
    })();
  }, []);

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
                <TouchableOpacity key={i} onPress={() => pickFromSuggestion(s)} style={styles.suggestionItem}>
                  <Text>{s.place_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.swapContainer}>
          <TouchableOpacity style={styles.swapButton} onPress={swapFromTo}>
            <Text style={{ fontSize: 18 }}>⇄</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>To</Text>
          <TextInput value={toText} onChangeText={setToText} placeholder="Where to?" style={styles.input} />
          {loadingSuggestions && <ActivityIndicator size="small" color={colors.primary} />}
          {toSuggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {toSuggestions.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => pickToSuggestion(s)} style={styles.suggestionItem}>
                  <Text>{s.place_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.mapContainer}>
        {mapboxToken && fromCoords && toCoords ? (
          <WebView
            ref={webviewRef}
            originWhitelist={["*"]}
            onMessage={() => {  }}
            source={{ html: buildMapHtml(mapboxToken) }}
            style={{ flex: 1 }}
          />
        ) : mapImage ? (
          <Image source={{ uri: mapImage }} style={styles.mapImage} />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={{ color: colors.textMuted }}>Map will appear here when both locations are set</Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={styles.sectionTitle}>Your Ranked Routes</Text>
        {loadingRoutes && <ActivityIndicator size="small" color={colors.primary} />}
        {!loadingRoutes && routes.length === 0 && <Text style={{ color: colors.textMuted }}>No routes available yet.</Text>}
        <FlatList
          data={routes}
          keyExtractor={(item) => item.profile}
          renderItem={({ item }) => {
            const isSelected = selectedProfile === item.profile;
            return (
              <View style={[styles.routeCard, isSelected && styles.routeCardSelected]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => {
                    try {
                      const payload = { type: 'routes', from: fromCoords, to: toCoords, routes: [item] };
                      if (webviewRef.current) webviewRef.current.postMessage(JSON.stringify(payload));
                      setSelectedProfile(item.profile);
                    } catch (_err) {
                      console.warn('failed to post route to webview', _err);
                    }
                  }}>
                    <Text style={styles.routeProfile}>{item.profile.toUpperCase()}</Text>
                    <Text style={{ color: colors.textMuted }}>{(item.distance/1609.344).toFixed(1)} mi • {(item.duration/60).toFixed(0)} min</Text>
                  </TouchableOpacity>

                  <View style={{ width: 120, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => {
                      Alert.alert('Start Route', `Starting ${item.profile} route (stub).`);
                    }} style={styles.goButton}>
                      <Text style={styles.goButtonText}>Go</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                      Alert.alert(item.profile.toUpperCase(), `Distance: ${(item.distance/1609.344).toFixed(2)} mi\nDuration: ${(item.duration/60).toFixed(1)} min`);
                    }} style={styles.detailsButton}>
                      <Text style={styles.detailsButtonText}>Details</Text>
                    </TouchableOpacity>
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
});
