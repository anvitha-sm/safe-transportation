import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { colors } from './theme';

export default function Settings() {
  const goBack = () => {
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>
      <Text style={styles.subtitle}>Manage your account and app preferences.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary, marginBottom: 8 },
  subtitle: { color: colors.textMuted },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backButton: { marginRight: 12, padding: 6 },
  backArrow: { fontSize: 20 },
});
