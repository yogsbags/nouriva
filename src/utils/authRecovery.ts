import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { clearBiometricLoginSnapshot } from './biometricLogin';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

/**
 * When refresh fails (revoked session, old install, or changed Supabase project),
 * clear local state so the user is not left with a half-broken session.
 */
export async function signOutCompletely(): Promise<void> {
  try {
    await clearBiometricLoginSnapshot();
    await SecureStore.deleteItemAsync('healthSyncEnabled').catch(() => {});
    await GoogleSignin.signOut().catch(() => {
      // The user may not have used Google Sign-In in this install.
    });
  } finally {
    await supabase.auth.signOut();
  }
}
