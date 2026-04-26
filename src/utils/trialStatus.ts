import * as SecureStore from 'expo-secure-store';

/**
 * Checks if the user's 3-day free trial is currently active.
 * A trial is active if:
 * 1. User is NOT Pro
 * 2. Current time is within 3 days (72 hours) of account creation.
 */
export async function isTrialActive(): Promise<boolean> {
  const isPro = (await SecureStore.getItemAsync('isPro')) === 'true';
  if (isPro) return true; // Pro users always have "active" access

  const createdAtStr = await SecureStore.getItemAsync('accountCreatedAt');
  if (!createdAtStr) return true; // Assume trial active if we don't know yet

  const createdAt = new Date(createdAtStr).getTime();
  const now = new Date().getTime();
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

  return (now - createdAt) < threeDaysInMs;
}
