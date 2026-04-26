import { supabase } from './supabase';
import { clearBiometricLoginSnapshot } from './biometricLogin';

/**
 * When refresh fails (revoked session, old install, or changed Supabase project),
 * clear local state so the user is not left with a half-broken session.
 */
export async function signOutCompletely(): Promise<void> {
  try {
    await clearBiometricLoginSnapshot();
  } finally {
    await supabase.auth.signOut();
  }
}
