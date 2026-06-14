import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import * as SecureStore from 'expo-secure-store';
import { saveUserProfile, loadUserProfile } from '../utils/userProfile';
import { isIosSimulator } from '../utils/iosSimulator';

const ENTITLEMENT_ID = 'Nouriva AI Pro';

function getRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') {
    return (process.env.EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_KEY ?? '').trim();
  }
  return (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY ?? '').trim();
}

/**
 * iOS Simulator + StoreKit often throws native NSExceptions; RN's Turbo path can then
 * crash inside Hermes while converting that exception to JS. Skip all Purchases native calls
 * on simulator unless explicitly overridden (e.g. Xcode StoreKit Configuration testing).
 */
const forceRevenueCatOnIosSimulator =
  process.env.EXPO_PUBLIC_REVENUECAT_ON_IOS_SIMULATOR === '1';

function shouldSkipRevenueCatNative(): boolean {
  if (Platform.OS === 'web') return true;
  if (!isIosSimulator()) return false;
  if (forceRevenueCatOnIosSimulator) return false;
  return true;
}

let revenueCatLogHandlerInstalled = false;
let iosSimulatorRevenueCatNoticeLogged = false;

/** Downgrade expected “no Play Store / emulator” billing noise so LogBox doesn’t show a red error. */
function installRevenueCatLogHandler() {
  if (revenueCatLogHandlerInstalled || Platform.OS === 'web') return;
  revenueCatLogHandlerInstalled = true;
  Purchases.setLogHandler((level, message) => {
    const billingUnavailableAndroid =
      Platform.OS === 'android' &&
      __DEV__ &&
      level === LOG_LEVEL.ERROR &&
      (message.includes('BILLING_UNAVAILABLE') ||
        message.includes('Billing is not available') ||
        message.includes('Billing service unavailable') ||
        message.includes('PurchaseNotAllowedError'));
    if (billingUnavailableAndroid) {
      console.warn(
        '[RevenueCat] Google Play Billing is unavailable on this device (typical on emulators without Google Play). IAP will not work until you use a Play-enabled image or a real device.'
      );
      return;
    }
    switch (level) {
      case LOG_LEVEL.VERBOSE:
      case LOG_LEVEL.DEBUG:
        console.debug(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.INFO:
        console.info(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.WARN:
        console.warn(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.ERROR:
        console.error(`[RevenueCat] ${message}`);
        break;
      default:
        console.log(`[RevenueCat] ${message}`);
    }
  });
}

/**
 * Ensure RC is configured — safe to call multiple times.
 * Configures without a userId if none is available (anonymous).
 */
async function ensureConfigured(userId?: string): Promise<boolean> {
  if (shouldSkipRevenueCatNative()) {
    if (__DEV__ && !iosSimulatorRevenueCatNoticeLogged) {
      iosSimulatorRevenueCatNoticeLogged = true;
      console.warn(
        '[RevenueCat] Skipping native SDK on iOS Simulator (unstable StoreKit). Pro state uses SecureStore / Supabase. Physical device or EXPO_PUBLIC_REVENUECAT_ON_IOS_SIMULATOR=1 to force.'
      );
    }
    return false;
  }
  installRevenueCatLogHandler();
  try {
    const already = await Purchases.isConfigured();
    if (already) return true;
  } catch {
    // isConfigured can throw if native module isn't ready; fall through to configure
  }
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
    const apiKey = getRevenueCatApiKey();
    if (!apiKey) {
      console.warn('[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_*_PUBLIC_KEY — skipping configure.');
      return false;
    }
    Purchases.configure({ apiKey, appUserID: userId });
    return true;
  } catch (e) {
    console.error('[RevenueCat] configure() failed:', e);
    return false;
  }
}

/**
 * Initialize RevenueCat SDK
 */
export async function initializeRevenueCat(userId?: string) {
  if (Platform.OS === 'web') return;

  const configured = await ensureConfigured(userId);
  if (!configured) return;

  // Initial sync of entitlement status
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    await syncProStatus(customerInfo);
  } catch (e) {
    console.warn('[RevenueCat] Initialization sync failed:', e);
  }
}

/**
 * Syncs the entitlement status from RevenueCat to local state and Supabase
 */
export async function syncProStatus(customerInfo: CustomerInfo) {
  const isProRC = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
  
  // If RevenueCat says Pro, always update everything
  if (isProRC) {
    await SecureStore.setItemAsync('isPro', 'true');
    try {
      const activeSub = Object.values(customerInfo.entitlements.active)[0];
      const plan = activeSub?.productIdentifier.includes('yearly') ? 'annual' : 'monthly';
      await saveUserProfile({ is_pro: true, pro_plan: plan as any });
    } catch (e) {
      console.warn('[RevenueCat] Supabase sync failed:', e);
    }
    return true;
  }

  // If RevenueCat says Free, check if we have a manual override in SecureStore or Supabase
  // We DON'T force-downgrade here to allow manual database testing
  const currentLocal = await SecureStore.getItemAsync('isPro');
  if (currentLocal === 'true') {
    console.log('[RevenueCat] Using local Pro override from SecureStore');
    return true;
  }

  // Final fallback: check Supabase directly one more time to be sure
  try {
    const profile = await loadUserProfile();
    if (profile?.is_pro) {
      console.log('[RevenueCat] Using Supabase Pro override for user');
      await SecureStore.setItemAsync('isPro', 'true');
      return true;
    }
  } catch (e) {
    console.warn('[RevenueCat] Fallback check failed:', e);
  }

  console.log('[RevenueCat] User is FREE (no RC sub, no local override, no Supabase override)');
  await SecureStore.setItemAsync('isPro', 'false');
  return false;
}

/**
 * Reconcile Pro for entitlements: RevenueCat when available, then always Supabase `user_profiles.is_pro`
 * (simulator / RC failures / admin grants). Call before enforcing trial or daily scan caps.
 */
export async function refreshProFromRemote(): Promise<boolean> {
  if (Platform.OS === 'web') return (await SecureStore.getItemAsync('isPro')) === 'true';

  const configured = await ensureConfigured();
  if (configured) {
    try {
      const info = await Purchases.getCustomerInfo();
      if (await syncProStatus(info)) return true;
    } catch (e) {
      console.warn('[RevenueCat] refreshProFromRemote RC path failed:', e);
    }
  }

  try {
    const profile = await loadUserProfile();
    if (profile?.is_pro) return true;
  } catch (e) {
    console.warn('[RevenueCat] refreshProFromRemote Supabase profile read failed:', e);
  }

  return (await SecureStore.getItemAsync('isPro')) === 'true';
}

/**
 * Present the RevenueCat Paywall (requires a paywall template configured in RC dashboard)
 * Returns true if the user successfully subscribed
 */
export async function presentPaywall(): Promise<boolean> {
  const configured = await ensureConfigured();
  if (!configured) return false;
  try {
    const result = await RevenueCatUI.presentPaywall({
      displayCloseButton: true,
    });

    // RevenueCat Paywalls handles the purchase flow and UI.
    // If we reach here, we should refresh customer info.
    const customerInfo = await Purchases.getCustomerInfo();
    return await syncProStatus(customerInfo);
  } catch (e) {
    console.error('[RevenueCat] Paywall error:', e);
    return false;
  }
}

/**
 * Purchase a specific plan ('annual' | 'monthly') by finding the matching package
 * from the default offering. This bypasses RevenueCat's paywall UI entirely.
 */
export async function purchasePlan(plan: 'annual' | 'monthly'): Promise<boolean> {
  const configured = await ensureConfigured();
  if (!configured) throw new Error('RevenueCat could not be initialized. Please try again.');
  // Cached + retried fetch — a single slow sandbox response here was enough to
  // surface "error when we attempt to make a purchase" to App Review (2.1b).
  const offerings = await getOfferingsCached();
  const current = offerings?.current;
  if (!current) {
    throw new Error('No current offering found. Please check your internet connection and try again.');
  }

  const pkg = plan === 'annual'
    ? current.annual ?? current.availablePackages.find(p => p.packageType === 'ANNUAL' || p.identifier === '$rc_annual')
    : current.monthly ?? current.availablePackages.find(p => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly');

  if (!pkg) {
    throw new Error(`Subscription package not found for plan: ${plan}. Please try again later.`);
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return await syncProStatus(customerInfo);
  } catch (e: any) {
    if (e.userCancelled) {
      return false; // User tapped Cancel — silent
    }
    console.error('[RevenueCat] purchasePlan error:', e);
    throw new Error(e?.message ?? 'Purchase failed. Please try again.');
  }
}

/**
 * Present the RevenueCat Customer Center for subscription management
 */
export async function presentCustomerCenter() {
  const configured = await ensureConfigured();
  if (!configured) return;
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.error('[RevenueCat] Customer Center error:', e);
    // Fallback for Android if Customer Center isn't configured/available
    if (Platform.OS === 'android') {
      const { openURL } = await import('expo-linking');
      void openURL('https://play.google.com/store/account/subscriptions');
    } else if (Platform.OS === 'ios') {
      const { openURL } = await import('expo-linking');
      void openURL('https://apps.apple.com/account/subscriptions');
    }
  }
}

/**
 * Manual purchase for a specific package (if not using Paywalls)
 */
export async function purchasePackage(pkg: PurchasesPackage) {
  const configured = await ensureConfigured();
  if (!configured) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return await syncProStatus(customerInfo);
  } catch (e: any) {
    if (!e.userCancelled) {
      console.error('[RevenueCat] Purchase error:', e);
    }
    return false;
  }
}

/**
 * Restore purchases
 */
export async function restorePurchases(): Promise<boolean> {
  const configured = await ensureConfigured();
  if (!configured) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return await syncProStatus(customerInfo);
  } catch (e) {
    console.error('[RevenueCat] Restore error:', e);
    return false;
  }
}

/**
 * Get available offerings
 */
export async function getOfferings() {
  const configured = await ensureConfigured();
  if (!configured) return null;
  try {
    return await Purchases.getOfferings();
  } catch (e) {
    console.error('[RevenueCat] Get offerings error:', e);
    return null;
  }
}

type Offerings = Awaited<ReturnType<typeof Purchases.getOfferings>>;

let cachedOfferings: Offerings | null = null;

/**
 * Offerings with retry + cache for the paywall (Apple 2.1(b): "subscription page did not load").
 * Retries transient sandbox failures with backoff, keeps the last good result so the
 * paywall renders instantly on subsequent opens, and records terminal failures to
 * Crashlytics so a reviewer-side failure can be correlated with a real cause.
 */
export async function getOfferingsCached(): Promise<Offerings | null> {
  if (cachedOfferings?.current) return cachedOfferings;

  const configured = await ensureConfigured();
  if (!configured) return null;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings?.current) {
        cachedOfferings = offerings;
        return offerings;
      }
      lastError = new Error('RevenueCat returned no current offering');
    } catch (e) {
      lastError = e;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  console.error('[RevenueCat] Get offerings failed after retries:', lastError);
  try {
    const { logError } = await import('../utils/analytics');
    logError(
      lastError instanceof Error ? lastError : new Error(String(lastError)),
      'RevenueCat getOfferings (paywall)'
    );
  } catch {
    // analytics unavailable (e.g. Expo Go) — already logged to console
  }
  return null;
}

/** Warm the offerings cache at app start so the paywall opens instantly. */
export function prefetchOfferings(): void {
  if (shouldSkipRevenueCatNative()) return;
  void getOfferingsCached().catch(() => {});
}
