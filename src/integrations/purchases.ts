import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import * as SecureStore from 'expo-secure-store';
import { saveUserProfile } from '../utils/userProfile';

const IOS_API_KEY = 'appl_uXWKxIPvlyFfCQBmXbXOwONFlBQ';
const ANDROID_API_KEY = 'goog_HBLkBgTamZlEzkgFQVuVXuIErtZ';
const ENTITLEMENT_ID = 'Nouriva AI Pro';

/**
 * Initialize RevenueCat SDK
 */
export async function initializeRevenueCat(userId?: string) {
  if (Platform.OS === 'web') return;

  Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  
  if (Platform.OS === 'ios') {
    Purchases.configure({ apiKey: IOS_API_KEY, appUserID: userId });
  } else if (Platform.OS === 'android') {
    Purchases.configure({ apiKey: ANDROID_API_KEY, appUserID: userId });
  }

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
    const { loadUserProfile } = await import('../utils/userProfile');
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
 * Present the RevenueCat Paywall (requires a paywall template configured in RC dashboard)
 * Returns true if the user successfully subscribed
 */
export async function presentPaywall(): Promise<boolean> {
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
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
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
  try {
    return await Purchases.getOfferings();
  } catch (e) {
    console.error('[RevenueCat] Get offerings error:', e);
    return null;
  }
}
