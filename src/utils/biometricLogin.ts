import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const BIOMETRIC_SESSION_KEY = 'nouriva_biometric_login_session';

export type StoredBiometricSession = {
  access_token: string;
  refresh_token: string;
};

export async function saveBiometricLoginSnapshot(session: Session | null): Promise<void> {
  if (!session?.access_token || !session?.refresh_token) return;
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_SESSION_KEY,
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
    );
  } catch (e) {
    console.warn('saveBiometricLoginSnapshot', e);
  }
}

export async function clearBiometricLoginSnapshot(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY);
  } catch {
    /* no-op */
  }
}

export async function readBiometricLoginSnapshot(): Promise<StoredBiometricSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBiometricSession;
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Restore Supabase session after Face ID / Touch ID / fingerprint.
 * Updates the stored snapshot if tokens rotate.
 */
export async function signInWithBiometric(): Promise<{ ok: boolean; error?: string }> {
  const snapshot = await readBiometricLoginSnapshot();
  if (!snapshot) return { ok: false, error: 'no_session' };

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) return { ok: false, error: 'no_biometric' };

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Sign in to Nouriva AI',
    fallbackLabel: '',
    cancelLabel: 'Cancel',
  });
  if (!result.success) return { ok: false, error: 'cancelled' };

  const { data, error } = await supabase.auth.setSession({
    access_token: snapshot.access_token,
    refresh_token: snapshot.refresh_token,
  });

  if (error) {
    await clearBiometricLoginSnapshot();
    return { ok: false, error: error.message };
  }

  if (data.session) {
    await saveBiometricLoginSnapshot(data.session);
  }

  return { ok: true };
}
