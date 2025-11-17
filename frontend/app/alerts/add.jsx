import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ScrollView, Alert, FlatList } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../theme';
import { createAlertApi, BASE_URL } from '../../api/api';

const CATEGORY_OPTIONS = ['road', 'theft', 'burglary', 'assault', 'weapon', 'cleanliness'];
const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

function CalendarModal({ visible, date, onClose, onSelect }) {
  const [selected, setSelected] = useState(date || new Date());

  const startOfMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const daysInMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();

  const prevMonth = () => setSelected(new Date(selected.getFullYear(), selected.getMonth() - 1, 1));
  const nextMonth = () => setSelected(new Date(selected.getFullYear(), selected.getMonth() + 1, 1));

  const chooseDay = (d) => {
    const chosen = new Date(selected.getFullYear(), selected.getMonth(), d);
    onSelect(chosen);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBackdrop}>
        <View style={styles.calendarBox}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={prevMonth}><Text style={styles.navText}>◀</Text></TouchableOpacity>
            <Text style={{ fontWeight: '700' }}>{selected.toLocaleString('default', { month: 'long' })} {selected.getFullYear()}</Text>
            <TouchableOpacity onPress={nextMonth}><Text style={styles.navText}>▶</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
            {Array.from({ length: daysInMonth }).map((_, i) => (
              <TouchableOpacity key={i} style={styles.dayBtn} onPress={() => chooseDay(i + 1)}>
                <Text style={styles.dayText}>{i + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Text style={{ color: 'white' }}>Close</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function AddAlert() {
  const [date, setDate] = useState(new Date());
  const [showCal, setShowCal] = useState(false);
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [usingGps, setUsingGps] = useState(false);
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [severity, setSeverity] = useState(SEVERITY_OPTIONS[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const mounted = useRef(true);

  const save = async () => {
    console.log('AddAlert.save called', { location, latitude, longitude, description, category, severity });
    if (!location || !description) {
      Alert.alert('Validation', 'Please provide location and description');
      return;
    }
    if (!latitude || !longitude) {
      try {
        console.log('Attempting server geocode for', location, 'using', BASE_URL);
        const res = await fetch(`${BASE_URL}/api/geocode?query=${encodeURIComponent(location)}`);
        console.log('geocode response ok?', res && res.ok);
        if (res.ok) {
          const json = await res.json();
          console.log('geocode json', json);
          if (Array.isArray(json.suggestions) && json.suggestions.length > 0) {
            const c = json.suggestions[0].center || json.suggestions[0].center;
            if (c && c.length >= 2) {
              setLongitude(c[0]);
              setLatitude(c[1]);
            }
          }
        }
      } catch (err) {
        console.warn('geocode fetch error', err);
      }
      }
      if (!latitude || !longitude) {
        console.warn('No coordinates determined; proceeding to save alert without coordinates');
      }
    setSaving(true);
    try {
      const payload = {
        location,
        latitude: (latitude != null && latitude !== '') ? parseFloat(latitude) : null,
        longitude: (longitude != null && longitude !== '') ? parseFloat(longitude) : null,
        description,
        category,
        severity,
        date: date.toISOString(),
      };
      const res = await createAlertApi(payload);
      console.log('createAlert response', res);
      Alert.alert('Saved', 'Community alert created');
      router.back();
    } catch (err) {
      console.error('createAlert error:', err);
      const msg = (err && err.message) ? err.message : 'Failed to create alert';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const useDeviceLocation = async () => {
    try {
      let Location;
      try {
        Location = require('expo-location');
      } catch (e) {
        Location = null;
      }

      if (!Location) {
        Alert.alert('Location Unavailable', 'Device location services are not available in this build.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant location permission to use GPS autofill.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({});
      const coords = pos.coords;
      if (coords) {
        setLatitude(coords.latitude);
        setLongitude(coords.longitude);
        setLocation(`Current location • ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
        setUsingGps(true);
        setSuggestions([]);
      }
    } catch (err) {
      console.warn('GPS error', err);
      Alert.alert('Error', 'Could not get device location.');
    }
  };

  const doAutocomplete = async (text) => {
    setSearchLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch(`${BASE_URL}/api/geocode?query=${encodeURIComponent(text)}`);
      console.log('autocomplete fetch ok?', res && res.ok);
      if (res.ok) {
        const json = await res.json();
        console.log('autocomplete json', json && json.suggestions && json.suggestions.length);
        if (Array.isArray(json.suggestions)) {
          setSuggestions(json.suggestions);
          return;
        }
      }
    } catch (e) {
    } finally {
      setSearchLoading(false);
    }
  };

  const onSelectSuggestion = (s) => {
    setLocation(s.place_name || '');
    if (s.center && s.center.length >= 2) {
      setLongitude(s.center[0]);
      setLatitude(s.center[1]);
    }
    setSuggestions([]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Community Alert</Text>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity style={styles.datePicker} onPress={() => setShowCal(true)}>
            <Text>{date.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setShowCategoryDropdown(true)}>
            <Text>{category}</Text>
          </TouchableOpacity>
          {showCategoryDropdown && (
            <View style={styles.dropdownList}>
              {CATEGORY_OPTIONS.map((c) => (
                <TouchableOpacity key={c} style={styles.dropdownItem} onPress={() => { setCategory(c); setShowCategoryDropdown(false); }}>
                  <Text style={category === c ? { fontWeight: '800' } : {}}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 12, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Severity</Text>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {SEVERITY_OPTIONS.map((s) => (
              <TouchableOpacity key={s} style={[styles.sevBtn, severity === s && styles.sevActive, { backgroundColor: s === 'low' ? '#dff7df' : s === 'medium' ? '#fff5d6' : s === 'high' ? '#ffe6d0' : '#ffd6d6' }]} onPress={() => setSeverity(s)}>
                <Text style={severity === s ? { fontWeight: '800' } : {}}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.label}>Location (human readable)</Text>
      <TextInput style={styles.input} value={location} onChangeText={(t) => { setLocation(t); if (t && t.length > 2) doAutocomplete(t); else setSuggestions([]); }} placeholder="e.g. Market St & 5th St" />
      <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'center' }}>
        <TouchableOpacity style={styles.gpsBtn} onPress={useDeviceLocation}>
          <Text style={styles.gpsBtnText}>{usingGps ? 'Using device location' : 'Use my location'}</Text>
        </TouchableOpacity>
        {usingGps && (
          <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => { setUsingGps(false); setLatitude(null); setLongitude(null); }}>
            <Text style={{ color: colors.textMuted }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {searchLoading && <Text style={{ color: colors.textMuted, marginTop: 6 }}>Searching...</Text>}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          <FlatList data={suggestions} keyExtractor={(i, idx) => String(idx)} renderItem={({ item }) => (
            <TouchableOpacity style={styles.suggestionItem} onPress={() => onSelectSuggestion(item)}>
              <Text>{item.place_name}</Text>
            </TouchableOpacity>
          )} />
        </View>
      )}

      {}

      <Text style={[styles.label, { marginTop: 12 }]}>Description</Text>
      <TextInput style={[styles.input, { height: 120 }]} value={description} onChangeText={setDescription} multiline />

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        <Text style={{ color: 'white', fontWeight: '700' }}>{saving ? 'Saving...' : 'Save'}</Text>
      </TouchableOpacity>

      <CalendarModal visible={showCal} date={date} onClose={() => setShowCal(false)} onSelect={(d) => setDate(d)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  datePicker: { backgroundColor: colors.offWhite, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder },
  optionBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.cardBg, marginBottom: 8 },
  optionActive: { borderWidth: 2, borderColor: colors.primary },
  sevBtn: { padding: 10, borderRadius: 8, backgroundColor: colors.cardBg, marginRight: 8 },
  sevActive: { borderWidth: 2, borderColor: colors.primary },
  input: { backgroundColor: colors.offWhite, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder, marginBottom: 8 },
  saveBtn: { marginTop: 12, backgroundColor: colors.primary, padding: 12, borderRadius: 10, alignItems: 'center' },
  gpsBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder },
  gpsBtnText: { color: colors.primaryDark, fontWeight: '700' },
  dropdown: { backgroundColor: colors.offWhite, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.lightBorder },
  dropdownList: { backgroundColor: colors.cardBg, marginTop: 8, borderRadius: 8, overflow: 'hidden' },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.lightBorder },
  suggestionsBox: { backgroundColor: colors.cardBg, borderRadius: 8, marginTop: 8, maxHeight: 160 },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: colors.lightBorder },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  calendarBox: { width: '90%', backgroundColor: 'white', padding: 16, borderRadius: 10 },
  dayBtn: { width: '14%', padding: 8, alignItems: 'center', marginBottom: 6 },
  dayText: { color: colors.textDark },
  navText: { fontSize: 18, fontWeight: '700' },
  closeBtn: { marginTop: 12, backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backButton: { marginRight: 10, padding: 6 },
  backArrow: { fontSize: 20 },
});
