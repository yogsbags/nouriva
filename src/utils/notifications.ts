import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { capture, Events } from './posthog';

// How the notification appears when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Request permission and return the Expo push token.
 * Saves the token to the user's Supabase profile so the Edge Function
 * can send targeted notifications.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // expo-constants exposes executionEnvironment; stubs work on simulators
  const isSimulator = !Constants.isDevice;
  if (isSimulator) {
    console.warn('[Notifications] Push only works on a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Nouriva AI',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  // Persist to Supabase so server-side functions can target this device
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_profiles')
        .upsert({ user_id: user.id, push_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }
  } catch (e) {
    console.warn('[Notifications] Failed to save push token:', e);
  }

  return token;
}

// ─── Listeners ────────────────────────────────────────────────────────────────

/**
 * Set up foreground + tap listeners. Call once in App.tsx.
 * Returns a cleanup function.
 */
export function setupNotificationListeners() {
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    const type = notification.request.content.data?.type as string ?? 'general';
    capture(Events.NOTIFICATION_RECEIVED, { type });
  });

  const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const type = response.notification.request.content.data?.type as string ?? 'general';
    capture(Events.NOTIFICATION_TAPPED, { type });
    // Future: navigate to a specific screen based on `type`
  });

  return () => {
    foregroundSub.remove();
    tapSub.remove();
  };
}

// ─── Local nudge helpers ───────────────────────────────────────────────────────
// These schedule local notifications on-device (no server needed).
// Use them for time-based re-engagement when you can't rely on a server call.

/**
 * Schedule a "haven't scanned today" nudge for the next day at 12:30pm
 * if the user hasn't scanned yet. Cancel if they scan before then.
 */
export async function scheduleDailyNudge() {
  // Cancel any existing daily nudge first (avoid duplicates)
  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'How is your body doing today? 🥗',
      body: 'Scan your next meal and track your biological age.',
      data: { type: 'daily_nudge' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 12,
      minute: 30,
    },
  });
}

/**
 * Cancel the daily nudge — call this immediately after a successful scan
 * so the user isn't nagged on a day they've already scanned.
 * Re-schedule for the NEXT day after cancelling.
 */
export async function onScanCompleted() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  // Re-arm for tomorrow
  await scheduleDailyNudge();
}

/**
 * Send an immediate local notification — useful for post-scan insights.
 * e.g. "Your meal scored -4 on longevity. Tap to see what to eat instead."
 */
export async function sendImmediateNotification(title: string, body: string, data: Record<string, any> = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null, // immediate
  });
}

// ─── Nudge catalogue ──────────────────────────────────────────────────────────
// Pre-written nudge copy. Call from ResultsScreen after analysis is complete.

export const Nudges = {
  lowLongevity: (score: number) => ({
    title: `Longevity score: ${score > 0 ? '+' : ''}${score}/10 ⚠️`,
    body: 'Your last meal aged your cells. Tap to see longevity-boosting swaps.',
    data: { type: 'low_longevity' },
  }),
  highInflammation: () => ({
    title: 'High inflammation detected 🔥',
    body: 'Your meal triggered an inflammatory response. See which compounds can help.',
    data: { type: 'high_inflammation' },
  }),
  streak: (days: number) => ({
    title: `${days}-day scan streak! 🎯`,
    body: 'Your dietary biological age data is getting sharper. Keep scanning!',
    data: { type: 'streak' },
  }),
} as const;
