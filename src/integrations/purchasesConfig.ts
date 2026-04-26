import { Platform } from 'react-native';

/** Env-only check so screens can avoid importing react-native-iap / Nitro at module load. */
export function hasConfiguredIapProducts(): boolean {
  const annual = process.env.EXPO_PUBLIC_IAP_SUBSCRIPTION_ANNUAL_ID ?? '';
  const monthly = process.env.EXPO_PUBLIC_IAP_SUBSCRIPTION_MONTHLY_ID ?? '';
  return Boolean(annual && monthly && Platform.OS !== 'web');
}
