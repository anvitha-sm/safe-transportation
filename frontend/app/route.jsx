import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from './theme';

export default function RouteScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Route</Text>
      <Text style={styles.subtitle}>This is the navigation / route planning screen.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.primary, marginBottom: 8 },
  subtitle: { color: colors.textMuted },
});
