import PostHog from 'posthog-react-native';

const posthogKey = (process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '').trim();
const posthogHost = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').trim();

export const posthog = new PostHog(posthogKey || 'disabled', {
  host: posthogHost,
  // Flush events in batches every 30s or when 20 events accumulate
  flushAt: 20,
  flushInterval: 30000,
});

/**
 * Capture a product event in PostHog only.
 * Prefer trackEvent() from analytics.ts so Firebase receives the same event.
 */
export function capture(event: string, properties: Record<string, any> = {}) {
  if (!posthogKey) return;
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
  if (!posthogKey) return;
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
  if (!posthogKey) return;
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

  // Upgrade / subscriptions
  UPGRADE_VIEWED:       'upgrade_viewed',        // props: source
  TRIAL_STARTED:        'trial_started',         // props: plan, source, period_type
  UPGRADE_COMPLETED:    'upgrade_completed',     // props: plan, source, period_type

  // Nudges
  NOTIFICATION_RECEIVED: 'notification_received', // props: type
  NOTIFICATION_TAPPED:   'notification_tapped',   // props: type
} as const;
