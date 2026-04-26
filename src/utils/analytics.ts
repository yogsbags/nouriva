import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

/**
 * Log a custom event to Firebase Analytics
 */
export async function logEvent(name: string, params: Record<string, any> = {}) {
  try {
    await analytics().logEvent(name, params);
  } catch (e) {
    console.warn('[Analytics] Failed to log event:', name, e);
  }
}

/**
 * Set user properties for better audience segmenting
 */
export async function setUserProperties(properties: Record<string, string | null>) {
  try {
    await analytics().setUserProperties(properties);
  } catch (e) {
    console.warn('[Analytics] Failed to set user properties:', e);
  }
}

/**
 * Track screen views manually
 */
export async function logScreenView(screenName: string, screenClass?: string) {
  try {
    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });
  } catch (e) {
    console.warn('[Analytics] Failed to log screen view:', screenName, e);
  }
}

/**
 * Identify user in both Analytics and Crashlytics
 */
export async function identifyUser(userId: string, email?: string) {
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

/**
 * Log a non-fatal error to Crashlytics
 */
export function logError(error: Error, context?: string) {
  const crash = crashlytics();
  if (context) {
    crash.log(`Context: ${context}`);
  }
  crash.recordError(error);
}
