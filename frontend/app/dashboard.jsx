import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserDataApi, updatePreferencesApi } from "../api/api";
import { colors } from "./theme";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [preferences, setPreferences] = useState({
    lighting: 10,
    footTraffic: 10,
    cleanliness: 10,
    crime: 10,
    speed: 10,
    cost: 10,
  });
  const [originalPreferences, setOriginalPreferences] = useState({
    lighting: 10,
    footTraffic: 10,
    cleanliness: 10,
    crime: 10,
    speed: 10,
    cost: 10,
  });
  const [preferencesChanged, setPreferencesChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rankingMode, setRankingMode] = useState(false);
  const defaultOrder = ["lighting", "footTraffic", "cleanliness", "crime", "speed", "cost"];
  const [rankingOrder, setRankingOrder] = useState(defaultOrder);

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {

    const hasChanged = JSON.stringify(preferences) !== JSON.stringify(originalPreferences);
    setPreferencesChanged(hasChanged);
  }, [preferences, originalPreferences]);

  const loadUserData = async () => {
    try {

      const userData = await AsyncStorage.getItem("@user_data");
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        

        try {
          const response = await getUserDataApi(parsedUser._id);
          if (response.user) {
            setRoutes(response.user.routes || []);
            

            if (response.user.preferences) {
              const dbPreferences = {
                lighting: response.user.preferences.lighting ?? 10,
                footTraffic: response.user.preferences.footTraffic ?? 10,
                cleanliness: response.user.preferences.cleanliness ?? 10,
                crime: response.user.preferences.crime ?? 10,
                speed: response.user.preferences.speed ?? 10,
                cost: response.user.preferences.cost ?? 10,
              };
              setPreferences(dbPreferences);
              setOriginalPreferences(dbPreferences);
            }
          }
        } catch (backendError) {

          console.warn("Failed to fetch from backend, using default data:", backendError);
        }
      } else {

        router.replace("/");
      }
    } catch (_error) {
      console.error("Error loading user data:", _error);
      Alert.alert("Error", "Failed to load your data. Please try logging in again.");
      router.replace("/");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getModeEmoji = (mode) => {
    switch (mode) {
      case "walking":
        return "🚶";
      case "transit":
        return "🚌";
      case "driving":
        return "🚗";
      default:
        return "🚗";
    }
  };

  const updatePreference = (key, value) => {
    setPreferences({
      ...preferences,
      [key]: value,
    });
  };

  const rankToValue = (rank) => {
    switch (rank) {
      case 1:
        return 18;
      case 2:
        return 15;
      case 3:
        return 12;
      case 4:
        return 9;
      case 5:
        return 6;
      case 6:
        return 3;
      default:
        return 0;
    }
  };

  const preferencesToRanking = (prefs) => {
    return Object.keys(prefs).sort((a, b) => {
      const diff = prefs[b] - prefs[a];
      if (diff !== 0) return diff;
      return defaultOrder.indexOf(a) - defaultOrder.indexOf(b);
    });
  };

  const orderToPreferences = (order) => {
    const mapped = {};
    for (let i = 0; i < order.length; i++) {
      mapped[order[i]] = rankToValue(i + 1);
    }
    return mapped;
  };

  const switchToRanking = () => {
    const order = preferencesToRanking(preferences);
    setRankingOrder(order);
    setRankingMode(true);
  };

  const switchToSliders = () => {
    const mapped = orderToPreferences(rankingOrder);
    setPreferences(mapped);
    setOriginalPreferences(mapped);
    setRankingMode(false);
  };

  const moveRank = (index, direction) => {
    const arr = [...rankingOrder];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= arr.length) return;
    const item = arr.splice(index, 1)[0];
    arr.splice(newIndex, 0, item);
    setRankingOrder(arr);
  };

  const PreferenceItem = ({ name, value }) => {
    const key = name;
    const [localValue, setLocalValue] = useState(value);
    const [trackWidth, setTrackWidth] = useState(0);

    useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const clamp = (v) => Math.max(0, Math.min(20, Math.round(v)));

    const setFromPosition = (x) => {
      if (!trackWidth) return;
      const ratio = x / trackWidth;
      const newVal = clamp(ratio * 20);
      setLocalValue(newVal);
      updatePreference(key, newVal);
    };

    const onTrackLayout = (e) => {
      setTrackWidth(e.nativeEvent.layout.width);
    };

    const handleResponder = (e) => {
      const x = e.nativeEvent.locationX;
      setFromPosition(x);
    };

    const onChangeText = (text) => {
      const parsed = parseInt(text.replace(/[^0-9]/g, ""), 10);
      if (Number.isNaN(parsed)) {
        setLocalValue(0);
        return;
      }
      const clamped = clamp(parsed);
      setLocalValue(clamped);
      updatePreference(key, clamped);
    };

    return (
      <View style={styles.preferenceItem}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.preferenceName}>
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </Text>
          <TextInput
            style={styles.numberInput}
            value={String(localValue)}
            keyboardType="numeric"
            onChangeText={onChangeText}
            maxLength={2}
          />
        </View>

        <View style={styles.sliderContainer}>
          <Text style={styles.sliderValue}>{localValue}</Text>
          <View
            style={styles.sliderTrack}
            onLayout={onTrackLayout}
            onStartShouldSetResponder={() => true}
            onResponderGrant={handleResponder}
            onResponderMove={handleResponder}
          >
            <View style={[styles.sliderFill, { width: `${(localValue / 20) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.adjustButton, localValue <= 0 && styles.adjustButtonDisabled]}
            onPress={() => updatePreference(key, Math.max(0, localValue - 1))}
            disabled={localValue <= 0}
          >
            <Text style={styles.adjustButtonText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.adjustButton, localValue >= 20 && styles.adjustButtonDisabled]}
            onPress={() => updatePreference(key, Math.min(20, localValue + 1))}
            disabled={localValue >= 20}
          >
            <Text style={styles.adjustButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const savePreferences = async () => {
    try {
      if (!user) return;

      const payload = rankingMode ? orderToPreferences(rankingOrder) : preferences;

      const response = await updatePreferencesApi(user._id, payload);

      if (response.preferences) {
        setOriginalPreferences(response.preferences);
      } else {
        setOriginalPreferences(payload);
      }
      setPreferencesChanged(false);
      Alert.alert("Success", "Your travel preferences have been saved!");
    } catch (_error) {
      console.error("Error saving preferences:", _error);
      Alert.alert("Error", "Failed to save preferences. Please try again.");
    }
  };

  const startNewRoute = () => {
    router.push("/route");
  };

  const goBack = () => {
    router.back();
  };

  if (loading || !user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }


  const sortedRoutes = [...routes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.greeting}>Hi, {user.name}!</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      </View>

      {}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Recent Routes</Text>

        {sortedRoutes.length > 0 ? (
          <View style={styles.routeRow}>
            {sortedRoutes.map((route, idx) => (
              <View key={route._id} style={[styles.routeCardInline, idx < sortedRoutes.length - 1 ? { marginRight: 12 } : {}]}>
                <View style={styles.routeHeader}>
                  <Text style={styles.routeMode}>{getModeEmoji(route.mode)}</Text>
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeStart} numberOfLines={1}>
                      {route.start}
                    </Text>
                    <Text style={styles.routeArrow}>→</Text>
                    <Text style={styles.routeEnd} numberOfLines={1}>
                      {route.end}
                    </Text>
                  </View>
                </View>
                <Text style={styles.routeDate}>{formatDate(route.date)}</Text>
                <TouchableOpacity
                  style={styles.feedbackButton}
                  onPress={() => router.push(`/route/feedback?userId=${user._id}&routeId=${route._id}`)}
                >
                  <Text style={styles.feedbackButtonText}>Feedback</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>You have not begun exploring just yet!</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.startRouteButton}
          onPress={startNewRoute}
        >
          <Text style={styles.startRouteButtonText}>+ Start a Route</Text>
        </TouchableOpacity>
      </View>

      {}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Travel Preferences</Text>
        <Text style={styles.sectionSubtitle}>
          We personalize your routes! Choose how you would like to set importance: with Sliders or by Ranking your priorities.
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.toggleButton, !rankingMode && styles.toggleActive]}
            onPress={switchToSliders}
          >
            <Text style={[styles.toggleText, !rankingMode && { color: "white" }]}>Sliders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, rankingMode && styles.toggleActive]}
            onPress={switchToRanking}
          >
            <Text style={[styles.toggleText, rankingMode && { color: "white" }]}>Rank</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginBottom: 12 }}>
          {rankingMode ? (
            <Text style={styles.scaleText}>1 (most important) to 6 (least important)</Text>
          ) : (
            <Text style={styles.scaleText}>0 (not important) to 20 (most important)</Text>
          )}
        </View>

        {rankingMode ? (
          <View>
            {rankingOrder.map((key, idx) => (
              <View key={key} style={[styles.preferenceItem, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}> 
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text style={{ fontWeight: "800", fontSize: 16, color: colors.accent }}>{idx + 1}</Text>
                  <Text style={styles.preferenceName}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={styles.rankButton} onPress={() => moveRank(idx, -1)}>
                    <Text style={{ fontSize: 18 }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rankButton} onPress={() => moveRank(idx, 1)}>
                    <Text style={{ fontSize: 18 }}>↓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View>
            {Object.entries(preferences).map(([key, value]) => (
              <PreferenceItem key={key} name={key} value={value} />
            ))}
          </View>
        )}

        {preferencesChanged && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={savePreferences}
          >
            <Text style={styles.saveButtonText}>Save Preferences</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.spacer} />
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

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },

  loadingText: {
    fontSize: 18,
    color: colors.headerText,
    fontWeight: "600",
  },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.sectionShadow,
  },

  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.headerText,
    marginBottom: 4,
  },

  email: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "500",
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  backArrow: {
    fontSize: 20,
    color: colors.primaryDark,
    fontWeight: "700",
  },

  section: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: colors.sectionShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 8,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "500",
    marginBottom: 16,
    lineHeight: 20,
  },

  routeCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: colors.sectionShadow,
  },

  routeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    flexWrap: 'wrap',
  },

  routeCardInline: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 14,
    flexBasis: '30%',
    maxWidth: '30%',
    minWidth: 160,
    borderLeftWidth: 4,
    borderLeftColor: colors.sectionShadow,
    marginBottom: 8,
  },

  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  routeMode: {
    fontSize: 24,
    marginRight: 10,
  },

  routeInfo: {
    flex: 1,
  },

  routeStart: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 2,
  },

  routeArrow: {
    fontSize: 12,
    color: "#bbb",
    marginVertical: 2,
  },

  routeEnd: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginTop: 2,
  },

  routeDate: {
    fontSize: 12,
    color: "#aaa",
    fontWeight: "500",
  },

  emptyState: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 14,
    color: "#aaa",
    fontWeight: "500",
  },

  startRouteButton: {
    backgroundColor: colors.buttonPink,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
    shadowColor: colors.buttonPink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  startRouteButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  preferenceItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.track,
  },

  preferenceName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 8,
  },

  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  sliderValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.accent,
    width: 30,
    textAlign: "center",
  },

  numberInput: {
    width: 48,
    height: 36,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: 8,
    textAlign: "center",
    fontWeight: "700",
    color: colors.textDark,
    backgroundColor: colors.offWhite,
  },

  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.track,
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: "hidden",
  },

  sliderFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 3,
  },

  buttonGroup: {
    flexDirection: "row",
    gap: 8,
  },

  adjustButton: {
    flex: 1,
    backgroundColor: colors.track,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.accent,
  },

  adjustButtonDisabled: {
    backgroundColor: "#f8f2fb",
    borderColor: "#ddd",
    opacity: 0.5,
  },

  adjustButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.accent,
  },

  saveButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  saveButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.offWhite,
    borderWidth: 1,
    borderColor: colors.lightBorder,
  },

  toggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  toggleText: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 14,
  },

  rankButton: {
    backgroundColor: colors.track,
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  scaleText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },

  spacer: {
    height: 20,
  },
  feedbackButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },

  feedbackButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});

