import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';
import { capture, identifyPostHogUser, resetPostHogUser } from './posthog';
import { isIosSimulator } from './iosSimulator';

const skipFirebaseNative = isIosSimulator();

/**
 * Log a custom event to both Firebase Analytics and PostHog.
 */
export async function logEvent(name: string, params: Record<string, any> = {}) {
  if (!skipFirebaseNative) {
    try {
      await analytics().logEvent(name, params);
    } catch (e) {
      console.warn('[Analytics] Firebase failed to log event:', name, e);
    }
  }
  // Mirror to PostHog (non-blocking)
  capture(name, params);
}

/**
 * Set user properties for better audience segmenting.
 */
export async function setUserProperties(properties: Record<string, string | null>) {
  if (!skipFirebaseNative) {
    try {
      await analytics().setUserProperties(properties);
    } catch (e) {
      console.warn('[Analytics] Failed to set user properties:', e);
    }
  }
  // Mirror string properties to PostHog
  const posthogProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v !== null) posthogProps[k] = v;
  }
  if (Object.keys(posthogProps).length > 0) {
    capture('$set', { $set: posthogProps });
  }
}

/**
 * Track screen views — called automatically from App.tsx onStateChange.
 */
export async function logScreenView(screenName: string, screenClass?: string) {
  if (!skipFirebaseNative) {
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
    } catch (e) {
      console.warn('[Analytics] Failed to log screen view:', screenName, e);
    }
  }
  // PostHog screen event
  capture('$screen', { $screen_name: screenName });
}

/**
 * Identify user in Firebase Analytics, Crashlytics, and PostHog.
 */
export async function identifyUser(userId: string, email?: string) {
  if (!skipFirebaseNative) {
    try {
      await analytics().setUserId(userId);
      const crash = crashlytics();
      await crash.setUserId(userId);
      if (email) {
        await crash.setAttributes({ email });
      }
    } catch (e) {
      console.warn('[Analytics] Failed to identify user:', e);
    }
  }
  identifyPostHogUser(userId, email ? { email } : undefined);
}

/**
 * Reset analytics identity on sign-out.
 */
export function resetUser() {
  if (!skipFirebaseNative) {
    try {
      analytics().setUserId(null as any);
    } catch { /* ignore */ }
  }
  resetPostHogUser();
}

/**
 * Log a non-fatal error to Crashlytics.
 */
export function logError(error: Error, context?: string) {
  if (skipFirebaseNative) return;
  const crash = crashlytics();
  if (context) {
    crash.log(`Context: ${context}`);
  }
  crash.recordError(error);
}
