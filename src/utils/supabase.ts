import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage: use AsyncStorage (not SecureStore).
 *
 * SecureStore maps to the iOS Keychain. Supabase runs token refresh on an interval
 * even when the app is backgrounded; Keychain reads can fail with
 * "User interaction is not allowed" / getValueWithKeyAsync, which spams LogBox.
 *
 * AsyncStorage is the recommended pairing for @supabase/supabase-js on React Native.
 * We one-time migrate any session that was saved under SecureStore so users stay signed in.
 */
const SupabaseAuthStorage = {
  getItem: async (key: string) => {
    try {
      const next = await AsyncStorage.getItem(key);
      if (next != null) return next;
    } catch (e) {
      console.warn('Supabase auth storage (AsyncStorage getItem):', e);
    }
    try {
      const legacy = await SecureStore.getItemAsync(key);
      if (legacy) {
        await AsyncStorage.setItem(key, legacy);
        await SecureStore.deleteItemAsync(key).catch(() => {});
        return legacy;
      }
    } catch {
      // Keychain unavailable (locked / background) — no session readable this tick
    }
    return null;
  },
  setItem: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
  removeItem: async (key: string) => {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

let client: SupabaseClient | null = null;

function getOrCreateClient(): SupabaseClient {
  if (client) return client;
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. For EAS builds, add them in expo.dev → Environment variables (production), then rebuild.'
    );
  }
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: SupabaseAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Lazy client so missing EAS env does not throw during module import (release APK crash). */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop, receiver) {
    return Reflect.get(getOrCreateClient() as object, prop, receiver);
  },
});
