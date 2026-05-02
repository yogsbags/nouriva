import PostHog from 'posthog-react-native';

export const posthog = new PostHog(
  'phc_xVNB2r0uOdndPxMn2jAIJ3WdKhcCQeFWiG9UzMKVxwb',
  {
    host: 'https://us.i.posthog.com',
    // Flush events in batches every 30s or when 20 events accumulate
    flushAt: 20,
    flushInterval: 30000,
  }
);

/**
 * Capture a product event in PostHog.
 * All events are also mirrored to Firebase Analytics via analytics.ts.
 */
export function capture(event: string, properties: Record<string, any> = {}) {
  try {
    posthog.capture(event, properties);
  } catch (e) {
    console.warn('[PostHog] Failed to capture event:', event, e);
  }
}

/**
 * Identify a logged-in user so events are attributed correctly.
 */
export function identifyPostHogUser(userId: string, properties?: Record<string, any>) {
  try {
    posthog.identify(userId, properties);
  } catch (e) {
    console.warn('[PostHog] Failed to identify user:', e);
  }
}

/**
 * Reset identity on sign-out.
 */
export function resetPostHogUser() {
  try {
    posthog.reset();
  } catch (e) {
    console.warn('[PostHog] Failed to reset user:', e);
  }
}

// ─── Typed event catalogue ───────────────────────────────────────────────────
// Call these from screens instead of raw capture() for consistency.

export const Events = {
  // Auth
  SIGN_IN:              'sign_in',
  SIGN_OUT:             'sign_out',

  // Scanning
  SCAN_STARTED:         'scan_started',
  SCAN_COMPLETED:       'scan_completed',       // props: food_name, vitality_score, longevity_score
  SCAN_FAILED:          'scan_failed',           // props: reason

  // Results navigation
  TAB_VIEWED:           'results_tab_viewed',    // props: tab (Holistic|Organ|Longevity|Alerts|Glucose)
  SHARE_TAPPED:         'share_tapped',          // props: type (food|longevity)

  // History
  HISTORY_MEAL_OPENED:  'history_meal_opened',   // props: food_name, days_ago

  // Profile
  PROFILE_VIEWED:       'profile_viewed',
  DIETARY_AGE_SEEN:     'dietary_age_seen',      // props: actual_age, dietary_age, delta

  // Upgrade
  UPGRADE_VIEWED:       'upgrade_viewed',        // props: source
  UPGRADE_COMPLETED:    'upgrade_completed',     // props: plan

  // Nudges
  NOTIFICATION_RECEIVED: 'notification_received', // props: type
  NOTIFICATION_TAPPED:   'notification_tapped',   // props: type
} as const;
