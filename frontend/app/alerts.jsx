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
import { BASE_URL } from '../api/api';
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
  const [allAlerts, setAllAlerts] = useState([]);
  const [alertsPage, setAlertsPage] = useState(0);
  const ALERTS_PAGE_SIZE = 5;

  const CATEGORY_OPTIONS = ['all', 'road', 'theft', 'burglary', 'assault', 'weapon', 'cleanliness'];
  const SEVERITY_OPTIONS = ['all', 'low', 'medium', 'high', 'urgent'];

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeverityDropdown, setShowSeverityDropdown] = useState(false);

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

  const fetchAlertsNearby = async (lat, lon, highlightLocation) => {
    setLoading(true);
    try {
      // Try backend endpoint first
      try {
        const params = [];
        if (lat != null && lon != null) {
          params.push(`lat=${lat}`);
          params.push(`lon=${lon}`);
        }
        if (selectedCategory && selectedCategory !== 'all') params.push(`category=${encodeURIComponent(selectedCategory)}`);
        if (selectedSeverity && selectedSeverity !== 'all') params.push(`severity=${encodeURIComponent(selectedSeverity)}`);
        const url = params.length > 0 ? `${BASE_URL}/api/alerts?${params.join('&')}` : `${BASE_URL}/api/alerts`;
        // debug
        // console.log('fetchAlertsNearby url', url);
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
          // If a highlightLocation (user selected a suggestion without coords) was provided,
          // push alerts whose title/location matches the suggestion to the top.
          if (highlightLocation) {
            const hl = String(highlightLocation).toLowerCase();
            items.sort((x, y) => {
              const xm = x.title && x.title.toLowerCase().includes(hl) ? 0 : 1;
              const ym = y.title && y.title.toLowerCase().includes(hl) ? 0 : 1;
              if (xm !== ym) return xm - ym;
              // otherwise sort by distance (nulls go last)
              const xd = x.distance != null ? x.distance : Number.POSITIVE_INFINITY;
              const yd = y.distance != null ? y.distance : Number.POSITIVE_INFINITY;
              return xd - yd;
            });
          }
          // store full list and set first page
          setAllAlerts(items);
          setAlertsPage(0);
          setNearbyAlerts(items.slice(0, ALERTS_PAGE_SIZE));
          return;
        }
      } catch (_e) {
        // ignore and fall back to mock
      }

      // Fallback: generate mock alerts with distances
      let mocks = generateMockAlerts(lat ?? 37.7749, lon ?? -122.4194).sort((a, b) => a.distance - b.distance);
      if (highlightLocation) {
        const hl = String(highlightLocation).toLowerCase();
        mocks.sort((x, y) => {
          const xm = x.title && x.title.toLowerCase().includes(hl) ? 0 : 1;
          const ym = y.title && y.title.toLowerCase().includes(hl) ? 0 : 1;
          if (xm !== ym) return xm - ym;
          return x.distance - y.distance;
        });
      }
      setAllAlerts(mocks);
      setAlertsPage(0);
      setNearbyAlerts(mocks.slice(0, ALERTS_PAGE_SIZE));
    } catch (err) {
      console.error(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  // when allAlerts or alertsPage changes, update the displayed nearbyAlerts
  useEffect(() => {
    const start = alertsPage * ALERTS_PAGE_SIZE;
    const slice = allAlerts.slice(start, start + ALERTS_PAGE_SIZE);
    setNearbyAlerts(slice);
  }, [allAlerts, alertsPage]);

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
        const res = await fetch(`${BASE_URL}/api/geocode?query=${encodeURIComponent(text)}`);
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
    const lon = (sugg.center && sugg.center[0]);
    const lat = (sugg.center && sugg.center[1]);
    if (lat != null && lon != null) {
      fetchAlertsNearby(lat, lon, sugg.place_name);
    } else {
      // No center coords returned (likely came from DB fallback). Fetch general list and highlight matching location.
      fetchAlertsNearby(null, null, sugg.place_name);
    }
  };

  // re-fetch when category/severity filters change
  useEffect(() => {
    fetchAlertsNearby(currentCoords?.latitude ?? null, currentCoords?.longitude ?? null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, selectedSeverity, currentCoords?.latitude, currentCoords?.longitude]);

  // when query or filters change, reset page
  useEffect(() => setAlertsPage(0), [query, selectedCategory, selectedSeverity]);

  // loadMoreAlerts removed in favor of page-based prev/next

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
        <TouchableOpacity onPress={() => setShowCategoryDropdown((s) => !s)} style={styles.filterButton}>
          <Text style={styles.filterButtonText}>Category: {selectedCategory}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowSeverityDropdown((s) => !s)} style={[styles.filterButton, { marginLeft: 8 }]}>
          <Text style={styles.filterButtonText}>Severity: {selectedSeverity}</Text>
        </TouchableOpacity>
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

      {showCategoryDropdown && (
        <View style={[styles.suggestions, { marginBottom: 8 }]}>
          {CATEGORY_OPTIONS.map((c) => (
            <TouchableOpacity key={c} style={styles.suggestionItem} onPress={() => { setSelectedCategory(c); setShowCategoryDropdown(false); }}>
              <Text style={styles.suggestionText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showSeverityDropdown && (
        <View style={[styles.suggestions, { marginBottom: 8 }]}>
          {SEVERITY_OPTIONS.map((s) => (
            <TouchableOpacity key={s} style={styles.suggestionItem} onPress={() => { setSelectedSeverity(s); setShowSeverityDropdown(false); }}>
              <Text style={styles.suggestionText}>{s}</Text>
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
                      <View>
                        <FlatList data={nearbyAlerts} keyExtractor={(i) => i.id} renderItem={renderAlert} />
                        {allAlerts.length > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, gap: 12 }}>
                            <TouchableOpacity onPress={() => setAlertsPage((p) => Math.max(0, p - 1))} disabled={alertsPage === 0} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: alertsPage === 0 ? '#ddd' : colors.track, borderRadius: 8 }}>
                              <Text style={{ fontWeight: '700' }}>Prev</Text>
                            </TouchableOpacity>
                            <Text style={{ color: colors.textMuted }}>{`Page ${alertsPage + 1} of ${Math.max(1, Math.ceil(allAlerts.length / ALERTS_PAGE_SIZE))}`}</Text>
                            <TouchableOpacity onPress={() => setAlertsPage((p) => Math.min(Math.max(0, Math.ceil(allAlerts.length / ALERTS_PAGE_SIZE) - 1), p + 1))} disabled={(alertsPage + 1) * ALERTS_PAGE_SIZE >= allAlerts.length} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: (alertsPage + 1) * ALERTS_PAGE_SIZE >= allAlerts.length ? '#ddd' : colors.track, borderRadius: 8 }}>
                              <Text style={{ fontWeight: '700' }}>Next</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
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
  addAlertText: { color: colors.offWhite, fontWeight: '700' },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    marginLeft: 8,
  },
  filterButtonText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
