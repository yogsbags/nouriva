import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { loadUserProfile } from './userProfile';

/**
 * 3-day / 20-scan window from account creation (for `scanEntitlements` only).
 * Results “full body” analysis (systemic, organ, longevity, glucose) is gated by Pro / RevenueCat
 * entitlement — including active subscription introductory offers — not by this flag.
 *
 * Considered active when not Pro and within 72h of `accountCreatedAt` (auth or profile).
 */
export async function isTrialActive(): Promise<boolean> {
  if ((await SecureStore.getItemAsync('isPro')) === 'true') return true;

  try {
    const profile = await loadUserProfile();
    if (profile?.is_pro) return true;
  } catch {
    /* use date-based trial below */
  }

  let createdAtStr = await SecureStore.getItemAsync('accountCreatedAt');

  if (!createdAtStr) {
    const { data: { session } } = await supabase.auth.getSession();
    const authCreated = session?.user?.created_at;
    if (authCreated) {
      createdAtStr = authCreated;
      void SecureStore.setItemAsync('accountCreatedAt', authCreated).catch(() => {});
    }
  }

  if (!createdAtStr) return false;

  const createdAt = new Date(createdAtStr).getTime();
  if (!Number.isFinite(createdAt)) return false;
  const now = new Date().getTime();
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

  return now - createdAt < threeDaysInMs;
}
