import * as SecureStore from 'expo-secure-store';

/**
 * Consent to share personal data (meal photos, health context, lab reports)
 * with Google Gemini — Apple 5.1.1(i)/5.1.2(i). The same key is written by the
 * onboarding consent slide; this module is the single read/write point used to
 * gate every Gemini call at runtime.
 */
const AI_CONSENT_KEY = 'aiConsentGiven';

/** true = granted, false = explicitly declined, null = never asked. */
export async function getAiConsent(): Promise<boolean | null> {
  try {
    const value = await SecureStore.getItemAsync(AI_CONSENT_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export async function setAiConsent(granted: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(AI_CONSENT_KEY, granted ? 'true' : 'false');
  } catch (e) {
    console.warn('[AIConsent] Failed to persist consent:', e);
  }
}
