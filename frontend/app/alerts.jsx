import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
  ScrollView,
} from "react-native";
import { colors } from "./theme";
import { router } from 'expo-router';
import debounce from "lodash.debounce";

// Note: This screen will try to use Expo Location if available. If not, it will
// fall back to mock data so the UI remains functional during development.

export default function Alerts() {
  const goBack = () => router.back();
  const [loading, setLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [nearbyAlerts, setNearbyAlerts] = useState([]);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    requestLocation();
    return () => (mounted.current = false);
  }, []);

  const requestLocation = async () => {
    setLoading(true);
    try {
      let Location;
      try {
        // dynamic import — may fail when expo-location is not installed
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        Location = require("expo-location");
      } catch (e) {
        Location = null;
      }

      if (Location) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          setLocationGranted(true);
          const pos = await Location.getCurrentPositionAsync({});
          const coords = pos.coords;
          setCurrentCoords({ latitude: coords.latitude, longitude: coords.longitude });
          fetchAlertsNearby(coords.latitude, coords.longitude);
        } else {
          // permission denied — still show recent alerts from backend
          setLocationGranted(false);
          setCurrentCoords(null);
          fetchAlertsNearby();
        }
      } else {
        // No expo-location available — load recent alerts from backend
        setLocationGranted(false);
        setCurrentCoords(null);
        fetchAlertsNearby();
      }
    } catch (err) {
      console.warn("Location error:", err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const fetchAlertsNearby = async (lat, lon) => {
    setLoading(true);
    try {
      // Try backend endpoint first
      try {
        const url = (lat != null && lon != null)
          ? `http://localhost:5000/api/alerts?lat=${lat}&lon=${lon}`
          : `http://localhost:5000/api/alerts`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const raw = Array.isArray(json.alerts) ? json.alerts : [];
          // normalize backend alert shape to UI-friendly items
          const items = raw.map((a) => {
            const id = a._id || a.id || (a._id && String(a._id)) || Math.random().toString();
            const title = a.location || a.title || '';
            const desc = a.description || a.desc || '';
            const latitude = a.latitude || a.lat || null;
            const longitude = a.longitude || a.lon || null;
            const distance = a.distance != null
              ? Math.round(a.distance)
              : (lat != null && lon != null && latitude != null && longitude != null)
                ? Math.round(distanceBetween(lat, lon, latitude, longitude) * 1000)
                : null;
            const time = a.date ? (new Date(a.date)).toLocaleString() : (a.time || 'recent');
            const category = a.category || '';
            const severity = a.severity || 'low';
            return { id, title, desc, latitude, longitude, distance, time, category, severity };
          });
          setNearbyAlerts(items.slice(0, 5));
          return;
        }
      } catch (e) {
        // ignore and fall back to mock
      }

      // Fallback: generate mock alerts with distances
      const mocks = generateMockAlerts(lat ?? 37.7749, lon ?? -122.4194).sort((a, b) => a.distance - b.distance).slice(0, 5);
      setNearbyAlerts(mocks);
    } catch (err) {
      console.error(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const generateMockAlerts = (lat, lon) => {
    // deterministic mock alerts for dev — distances in meters
    const base = [
      { title: "Pothole reported", desc: "Large pothole near intersection", lat: lat + 0.001, lon: lon + 0.001 },
      { title: "Crowded sidewalk", desc: "Heavy foot traffic reported", lat: lat - 0.0008, lon: lon - 0.0004 },
      { title: "Construction", desc: "Roadwork causing delays", lat: lat + 0.0005, lon: lon - 0.0009 },
      { title: "Suspicious activity", desc: "Reported near bus stop", lat: lat - 0.0012, lon: lon + 0.0003 },
      { title: "Poor lighting", desc: "Streetlights out after dusk", lat: lat + 0.0002, lon: lon + 0.0007 },
      { title: "Accident", desc: "Minor collision; expect delays", lat: lat - 0.002, lon: lon - 0.001 },
    ];

    return base.map((b) => ({
      ...b,
      distance: Math.round(distanceBetween(lat, lon, b.lat, b.lon) * 1000),
      time: "2h ago",
      id: `${b.title}-${Math.round(Math.random() * 10000)}`,
    }));
  };

  const distanceBetween = (lat1, lon1, lat2, lon2) => {
    // approximate haversine in km
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  /* ---------- Autocomplete / search ---------- */
  const doAutocomplete = async (text) => {
    setSearchLoading(true);
    setSuggestions([]);
    try {
      // If backend provides a geocode/autocomplete endpoint, call it
      try {
        const res = await fetch(`http://localhost:5000/api/geocode?query=${encodeURIComponent(text)}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.suggestions)) {
            setSuggestions(json.suggestions);
            return;
          }
        }
      } catch (e) {
        // ignore and fall back to simple suggs
      }

      // Simple fallback suggestions (not real autocomplete)
      const fallback = [
        { place_name: `${text} Park`, center: [currentCoords?.longitude ?? -122.4194, currentCoords?.latitude ?? 37.7749] },
        { place_name: `${text} Station`, center: [(currentCoords?.longitude ?? -122.4194) + 0.005, (currentCoords?.latitude ?? 37.7749) - 0.003] },
      ];
      setSuggestions(fallback);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  // debounce user typing to avoid spamming autocomplete
  const debouncedAuto = useRef(debounce((t) => doAutocomplete(t), 400)).current;

  const onChangeQuery = (text) => {
    setQuery(text);
    if (!text) {
      setSuggestions([]);
      return;
    }
    debouncedAuto(text);
  };

  const onSelectSuggestion = (sugg) => {
    Keyboard.dismiss();
    setQuery(sugg.place_name || "");
    setSuggestions([]);
    // center is [lon, lat]
    const lon = (sugg.center && sugg.center[0]) || currentCoords?.longitude;
    const lat = (sugg.center && sugg.center[1]) || currentCoords?.latitude;
    if (lat && lon) fetchAlertsNearby(lat, lon);
  };

  /* ---------- UI rendering helpers ---------- */
  const renderAlert = ({ item }) => (
    <View style={styles.alertCard} key={item.id}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle}>{item.title}</Text>
          <Text style={styles.alertDesc}>{item.desc}</Text>
          <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.alertTime}>{item.time}</Text>
            <Text style={styles.alertDistance}>{item.distance ? `${item.distance} m` : "Nearby"}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {item.category ? <Text style={{ marginRight: 8, fontSize: 12, color: colors.textMuted }}>#{item.category}</Text> : null}
        <Text style={{ fontSize: 12, fontWeight: '700', color: item.severity === 'urgent' ? '#b00020' : (item.severity === 'high' ? '#d66500' : (item.severity === 'medium' ? '#b08b00' : '#4caf50')) }}>{item.severity}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.header}>Community Alerts</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          placeholder="Search for a place or address"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
        />
        {searchLoading && <ActivityIndicator style={{ marginLeft: 8 }} />}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s, i) => (
            <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => onSelectSuggestion(s)}>
              <Text style={styles.suggestionText}>{s.place_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View>
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Near You</Text>
              <TouchableOpacity style={styles.addAlertBtn} onPress={() => router.push('/alerts/add')}>
                <Text style={styles.addAlertText}>Add an alert</Text>
              </TouchableOpacity>
            </View>
            {nearbyAlerts.length === 0 ? (
              <Text style={styles.emptyText}>{locationGranted ? 'No community alerts near you.' : 'No community alerts available.'}</Text>
            ) : (
              <FlatList data={nearbyAlerts} keyExtractor={(i) => i.id} renderItem={renderAlert} />
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 96,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backButton: { marginRight: 10, padding: 6 },
  backArrow: { fontSize: 20 },
  header: { fontSize: 24, fontWeight: "800", color: colors.primary },
  searchRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.offWhite,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    color: colors.textDark,
  },
  suggestions: { backgroundColor: colors.cardBg, borderRadius: 8, marginBottom: 8, overflow: "hidden" },
  suggestionItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.lightBorder },
  suggestionText: { color: colors.textDark },
  section: { marginTop: 12, backgroundColor: colors.cardBg, padding: 12, borderRadius: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.primary, marginBottom: 8 },
  emptyText: { color: colors.textMuted },
  alertCard: { padding: 12, backgroundColor: colors.offWhite, borderRadius: 8, marginBottom: 10 },
  alertTitle: { fontSize: 16, fontWeight: "800", color: colors.headerText },
  alertDesc: { color: colors.textMuted, marginTop: 6 },
  alertTime: { color: colors.textMuted, marginTop: 8, fontSize: 12 },
  alertDistance: { color: colors.primaryDark, fontWeight: "700" },
  addAlertBtn: { backgroundColor: colors.buttonPink, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  addAlertText: { color: colors.primaryDark, fontWeight: '700' },
});
