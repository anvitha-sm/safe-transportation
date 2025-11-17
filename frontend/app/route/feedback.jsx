import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addRouteFeedbackApi, getUserDataApi } from '../../api/api';

export default function RouteFeedback() {
  let userId = null;
  let routeId = null;
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    userId = sp.get('userId');
    routeId = sp.get('routeId');
  } else {
    try {
      const sp = new URLSearchParams(global?.location?.search || '');
      userId = sp.get('userId');
      routeId = sp.get('routeId');
    } catch (_e) {
      userId = null;
      routeId = null;
    }
  }

  const [ratings, setRatings] = useState({
    lighting: 5,
    footTraffic: 5,
    cleanliness: 5,
    crime: 5,
    speed: 5,
    cost: 5,
  });
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    (async () => {
      if (!userId || !routeId) return;
      try {
        const resp = await getUserDataApi(userId);
        if (resp && resp.user && Array.isArray(resp.user.routes)) {
            const route = resp.user.routes.find((r) => String(r._id) === String(routeId));
            if (route) {
              setRouteInfo({ start: route.start, end: route.end, date: route.date, mode: route.mode });
              if (route.feedback && route.feedback.ratings) {
                const dbRatings = route.feedback.ratings;
                setRatings({
                  lighting: typeof dbRatings.lighting === 'number' ? dbRatings.lighting : 5,
                  footTraffic: typeof dbRatings.footTraffic === 'number' ? dbRatings.footTraffic : 5,
                  cleanliness: typeof dbRatings.cleanliness === 'number' ? dbRatings.cleanliness : 5,
                  crime: typeof dbRatings.crime === 'number' ? dbRatings.crime : 5,
                  speed: typeof dbRatings.speed === 'number' ? dbRatings.speed : 5,
                  cost: typeof dbRatings.cost === 'number' ? dbRatings.cost : 5,
                });
                setComments(route.feedback.comments || '');
              }
            }
          }
      } catch (err) {
        console.warn('Failed to load existing feedback', err);
      }
    })();
  }, [userId, routeId]);

  const setRating = (key, value) => {
    const v = Math.round(value);
    const clamped = Math.max(1, Math.min(10, v));
    setRatings((r) => ({ ...r, [key]: clamped }));
  };

  const clamp = (v) => Math.max(1, Math.min(10, Math.round(v)));
  const PreferenceSlider = ({ k }) => {
    const key = k;
    const [trackWidth, setTrackWidth] = useState(0);

    const onTrackLayout = (e) => setTrackWidth(e.nativeEvent.layout.width || 0);

    const setFromPosition = (x) => {
      if (!trackWidth) return;
      const ratio = x / trackWidth;
      const newVal = clamp(ratio * 10);
      setRating(key, newVal);
    };

    const handleResponder = (e) => {
      const x = e.nativeEvent.locationX;
      setFromPosition(x);
    };

    const onChangeText = (text) => {
      const parsed = parseInt(String(text).replace(/[^0-9]/g, ''), 10);
      if (Number.isNaN(parsed)) return;
      const v = clamp(parsed);
      setRating(key, v);
    };

    const value = ratings[key] ?? 5;

    return (
      <View style={styles.preferenceItem} key={key}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.preferenceName}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
          <TextInput
            style={styles.numberInput}
            value={String(value)}
            keyboardType="numeric"
            onChangeText={onChangeText}
            maxLength={2}
          />
        </View>

        <View style={styles.sliderContainer}>
          <Text style={styles.sliderValue}>{value}</Text>
          <View
            style={styles.sliderTrack}
            onLayout={onTrackLayout}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleResponder}
            onResponderMove={handleResponder}
          >
            <View style={[styles.sliderFill, { width: `${(value / 10) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.adjustButton, value <= 1 && styles.adjustButtonDisabled]}
            onPress={() => setRating(key, Math.max(1, value - 1))}
            disabled={value <= 1}
          >
            <Text style={styles.adjustButtonText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.adjustButton, value >= 10 && styles.adjustButtonDisabled]}
            onPress={() => setRating(key, Math.min(10, value + 1))}
            disabled={value >= 10}
          >
            <Text style={styles.adjustButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (!userId || !routeId) throw new Error('Missing route/user id');
      const token = await AsyncStorage.getItem('@user_token');
      await addRouteFeedbackApi(userId, routeId, { ratings, comments }, token);
      setSaving(false);
      Alert.alert('Saved', 'Your feedback has been saved.');
      try { router.back(); } catch (_) {  }
    } catch (err) {
      console.error('Failed to save feedback', err);
      setSaving(false);
      Alert.alert('Error', 'Failed to save feedback');
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      <View style={{ padding: 16 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginBottom: 6 }}>Rate Your Route</Text>
        </View>
        {routeInfo ? (
          <View style={styles.routeSummaryContainer}>
            <Text style={styles.routeSummaryText} numberOfLines={1}>{routeInfo.start} → {routeInfo.end}</Text>
            <Text style={styles.routeSummaryDate}>{formatDate(routeInfo.date)}</Text>
          </View>
        ) : null}

        {['lighting', 'footTraffic', 'cleanliness', 'crime', 'speed', 'cost'].map((k) => (
          <PreferenceSlider k={k} key={k} />
        ))}

        <Text style={{ marginTop: 8, fontWeight: '700', color: colors.primary }}>Comments (optional)</Text>
        <TextInput
          style={styles.textArea}
          value={comments}
          onChangeText={setComments}
          placeholder="What went well or could be improved?"
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.saveButton} onPress={submit} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Feedback'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addAlertUnder, { marginTop: 12 }]} onPress={() => router.push('/alerts/add')}>
          <Text style={styles.addAlertUnderText}>Add an alert</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  preferenceItem: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.track,
  },
  preferenceName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
    width: 30,
    textAlign: 'center',
  },
  numberInput: {
    width: 48,
    height: 36,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: 8,
    textAlign: 'center',
    fontWeight: '700',
    color: colors.textDark,
    backgroundColor: colors.offWhite,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.track,
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustButton: {
    flex: 1,
    backgroundColor: colors.track,
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  adjustButtonDisabled: {
    backgroundColor: '#f8f2fb',
    borderColor: '#ddd',
    opacity: 0.5,
  },
  adjustButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
  },
  textArea: { backgroundColor: colors.offWhite, padding: 12, borderRadius: 10, marginTop: 8, color: colors.textDark },
  saveButton: { marginTop: 16, backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveButtonText: { color: 'white', fontWeight: '700' },
  routeSummaryContainer: { marginBottom: 12, backgroundColor: colors.offWhite, padding: 8, borderRadius: 8 },
  routeSummaryText: { fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  routeSummaryDate: { fontSize: 12, color: colors.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backButton: { marginRight: 12, padding: 6 },
  backArrow: { fontSize: 20, color: colors.primaryDark },
  addAlertUnder: { alignSelf: 'center', backgroundColor: colors.buttonPink, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  addAlertUnderText: { color: colors.primaryDark, fontWeight: '700' },
});
