import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

/** Legacy (device-global) — caused new accounts to inherit another user’s progress */
const LEGACY_ONBOARDING = 'hasCompletedOnboarding';
const LEGACY_PAYWALL = 'hasSeenInitialPaywall';

const LAST_ONBOARDING_USER = 'lastOnboardingUserId';

const kOnb = (userId: string) => `onboardingDone__${userId}`;
const kPay = (userId: string) => `initialPaywallSeen__${userId}`;
const kPayPending = (userId: string) => `initialPaywallPending__${userId}`;

export type OnboardingFlags = { completed: boolean; paywallSeen: boolean };

/**
 * Resolves onboarding + paywall for this Supabase user. Uses per-user keys so
 * a new account does not reuse another account’s state on the same device.
 *
 * Fallback: If local flag is missing, we check if the user has a record in
 * user_profiles with onboarding_completed or a health_goal.
 */
export async function loadOnboardingFlagsForUserId(userId: string): Promise<OnboardingFlags> {
  const last = await SecureStore.getItemAsync(LAST_ONBOARDING_USER);
  if (last && last !== userId) {
    // New user on this device — clear all device-global legacy keys so the
    // new account doesn't inherit the previous user's onboarding or pro status.
    await SecureStore.deleteItemAsync(LEGACY_ONBOARDING).catch(() => undefined);
    await SecureStore.deleteItemAsync(LEGACY_PAYWALL).catch(() => undefined);
    await SecureStore.deleteItemAsync('isPro').catch(() => undefined);
  }

  let completed = (await SecureStore.getItemAsync(kOnb(userId))) === 'true';
  let paywallSeen = (await SecureStore.getItemAsync(kPay(userId))) === 'true';
  const paywallPending = (await SecureStore.getItemAsync(kPayPending(userId))) === 'true';

  // Fallback check to database if local flag is false
  if (!completed) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('onboarding_completed, health_goal')
        .eq('user_id', userId)
        .single();
      
      // If either the explicit flag is true OR they have a health goal, they are done.
      if (!error && (data?.onboarding_completed || data?.health_goal)) {
        completed = true;
        // Sync back to local store for next time
        await setOnboardingCompleteForUserId(userId);
      }
    } catch (e) {
      console.warn('Onboarding fallback check failed:', e);
    }
  }

  if (!completed) {
    const leg = await SecureStore.getItemAsync(LEGACY_ONBOARDING);
    if (leg === 'true') {
      await SecureStore.setItemAsync(kOnb(userId), 'true');
      await SecureStore.deleteItemAsync(LEGACY_ONBOARDING).catch(() => undefined);
      completed = true;
    }
  }
  if (!paywallSeen) {
    const leg = await SecureStore.getItemAsync(LEGACY_PAYWALL);
    if (leg === 'true') {
      await SecureStore.setItemAsync(kPay(userId), 'true');
      await SecureStore.deleteItemAsync(LEGACY_PAYWALL).catch(() => undefined);
      paywallSeen = true;
    }
  }

  // Accounts that completed onboarding before this flow was introduced should
  // enter the app normally. Only an explicit pending marker gates a new user.
  if (completed && !paywallSeen && !paywallPending) {
    await SecureStore.setItemAsync(kPay(userId), 'true');
    paywallSeen = true;
  }

  await SecureStore.setItemAsync(LAST_ONBOARDING_USER, userId);
  return { completed, paywallSeen };
}

export async function setOnboardingCompleteForUserId(userId: string) {
  await SecureStore.setItemAsync(kOnb(userId), 'true');
  await SecureStore.deleteItemAsync(LEGACY_ONBOARDING).catch(() => undefined);
}

export async function setInitialPaywallPendingForUserId(userId: string) {
  await SecureStore.setItemAsync(kPayPending(userId), 'true');
}

export async function setInitialPaywallSeenForUserId(userId: string) {
  await SecureStore.setItemAsync(kPay(userId), 'true');
  await SecureStore.deleteItemAsync(kPayPending(userId)).catch(() => undefined);
  await SecureStore.deleteItemAsync(LEGACY_PAYWALL).catch(() => undefined);
}

/** Call on sign-out so the next SIGNED_IN runs a clean “user id changed” check */
export async function clearOnboardingUserBinding() {
  await SecureStore.deleteItemAsync(LAST_ONBOARDING_USER).catch(() => undefined);
}
