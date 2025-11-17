import React, { useEffect, useState } from "react";
import { Slot, useSegments, router } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from "./theme";

function BottomNav() {
  return (
    <View style={styles.navContainer}>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push('/locations')}>
        <Text style={styles.icon}>📞</Text>
        <Text style={styles.label}>Locations + Emergency</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push('/route')}>
        <Text style={styles.icon}>📍</Text>
        <Text style={styles.label}>Navigate</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push('/alerts')}>
        <Text style={styles.icon}>🚨</Text>
        <Text style={styles.label}>Community Alerts</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => router.push('/dashboard')}>
        <Text style={styles.icon}>⚙️</Text>
        <Text style={styles.label}>Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('@user_token');
        if (mounted) setIsLoggedIn(!!token);
      } catch {
        if (mounted) setIsLoggedIn(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
  const isAuthRoute = segments && segments[0] === 'auth';
  const isIndexRoute = (segments as any) && (segments as any).length === 0;

  const showBottomNav = isLoggedIn && !isAuthRoute && !isIndexRoute;

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      {showBottomNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    height: 76,
    backgroundColor: colors.cardBg,
    borderTopWidth: 1,
    borderTopColor: colors.lightBorder,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
