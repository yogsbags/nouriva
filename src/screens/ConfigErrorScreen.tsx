import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../theme';

/**
 * Shown when EXPO_PUBLIC_SUPABASE_* were not present at EAS build time
 * (local .env is not uploaded with cloud builds).
 */
export default function ConfigErrorScreen() {
  const C = useColors();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: C.textPrimary }]}>App configuration missing</Text>
        <Text style={[styles.p, { color: C.textSecondary }]}>
          This build was created without the public Supabase URL and anon key. Add them to your Expo
          project, then run a new build.
        </Text>
        <Text style={[styles.p, { color: C.textSecondary }]}>
          In expo.dev, open this project, then Environment variables. Add the same
          EXPO_PUBLIC_* keys as in your local .env (at least EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY) for the production environment, then rebuild the APK. Add
          the rest of your EXPO_PUBLIC_* keys (e.g. Gemini) the same way so scanning works.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  p: { fontSize: 16, lineHeight: 24, marginTop: 8 },
});
