import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors } from './theme';

export default function Locations() {
  const goBack = () => router.back();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Locations + Emergency</Text>
      </View>
      <Text style={styles.subtitle}>Quick access to emergency contacts and safe locations.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16,
    paddingBottom: 96,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backButton: { marginRight: 10, padding: 6 },
  backArrow: { fontSize: 20 },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary, marginBottom: 8 },
  subtitle: { color: colors.textMuted },
});
