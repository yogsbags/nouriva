/**
 * Single source of truth for legal URLs (Apple 5.1.1 / 3.1.2c).
 * Screens previously hard-coded diverging productverse.in paths; keep every
 * surface (auth, onboarding consent, paywall, profile) on the same env-driven pair.
 */
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://productverse.in/nouriva-terms-of-use';
export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://productverse.in/nouriva-privacy-policy';