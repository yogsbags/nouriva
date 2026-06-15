import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { XIcon as X, CheckIcon as Check } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useColors, AppColors } from '../theme';
import { ScreenEnterAnimation } from '../components/ScreenEnterAnimation';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { hasConfiguredIapProducts } from '../integrations/purchasesConfig';
import { isExpoGo } from '../utils/expoRuntime';
import { saveUserProfile } from '../utils/userProfile';
import { trackEvent, Events, trackSubscriptionSuccess } from '../utils/analytics';

/** Shapes we read from RevenueCat at runtime; avoids importing native IAP modules at screen load. */
type PlanProduct = {
  displayPrice: string;   // monthly equivalent for annual; full price for monthly
  billedText: string;     // e.g. "$59.99 billed yearly" / "Billed monthly"
  yearlyDisplayPrice?: string; // full billed yearly price shown as primary for annual card
  id?: string;
  currentPlanId?: string;
} | null;

interface UpgradeScreenProps {
  navigation: any;
  onComplete?: () => void;
}

type Plan = 'annual' | 'monthly';

/** Short single-line bullets — Cal-style minimal paywall */
const FEATURE_LINES = [
  'Unlimited scans & full analysis',
  'Glucose & organ-level insights',
  'Lab uploads & profile-aware scans',
];

import { TERMS_URL, PRIVACY_URL } from '../constants/legal';

export type UpgradePaywallContext = 'trial_scan_limit' | 'daily_scan_limit';

export default function UpgradeScreen({ navigation, onComplete }: UpgradeScreenProps) {
  const route = useRoute<any>();
  const paywallContext = route.params?.paywallContext as UpgradePaywallContext | undefined;

  const C = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  const limitBannerText =
    paywallContext === 'trial_scan_limit'
      ? "You've used all 20 trial scans. Unlock unlimited analysis with Pro."
      : paywallContext === 'daily_scan_limit'
        ? 'After your trial, free accounts get 1 scan per day. Pro is unlimited.'
        : null;
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [storeProducts, setStoreProducts] = useState<{
    annual: PlanProduct;
    monthly: PlanProduct;
  }>({ annual: null, monthly: null });
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    if (onComplete) {
      onComplete();
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: go to Main app state
      navigation.navigate('Main');
    }
  }, [onComplete, navigation]);

  const completeAfterPurchase = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleClose();
  }, [handleClose]);



  const loadStoreProducts = useCallback(async () => {
    if (isExpoGo()) {
      setStoreLoading(false);
      return;
    }

    setStoreLoading(true);
    setStoreError(false);

    // Timeout guard: if RevenueCat takes > 12 s (common in sandbox on iPad), show error + retry.
    // The fetch keeps running underneath (getOfferingsCached retries with backoff) and clears
    // the error banner if it eventually succeeds.
    let finished = false;
    const timeoutId = setTimeout(() => {
      if (finished) return;
      setStoreLoading(false);
      setStoreError(true);
    }, 12_000);

    try {
      const { getOfferingsCached } = await import('../integrations/purchases');
      const offerings = await getOfferingsCached();
      const current = offerings?.current;

      if (!current) {
        setStoreError(true);
        return;
      }

      const annualPackage = current.annual
        ?? current.availablePackages?.find((p: any) => p.packageType === 'ANNUAL' || p.identifier === '$rc_annual');
      const monthlyPackage = current.monthly
        ?? current.availablePackages?.find((p: any) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly');

      setStoreProducts({
        annual: buildPlanProduct(annualPackage, 'annual'),
        monthly: buildPlanProduct(monthlyPackage, 'monthly'),
      });
      // Success after the 12 s timeout already fired: clear the stale error banner.
      setStoreError(false);
    } catch (e) {
      console.warn('[RevenueCat] Failed to load localized products:', e);
      setStoreError(true);
    } finally {
      finished = true;
      clearTimeout(timeoutId);
      setStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStoreProducts();
  }, [loadStoreProducts]);

  useEffect(() => {
    trackEvent(Events.UPGRADE_VIEWED, { source: paywallContext ?? 'organic' });
  }, [paywallContext]);

  const handleSubscribe = async () => {
    if (isExpoGo()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await SecureStore.setItemAsync('isPro', 'true');
      await SecureStore.setItemAsync('proplan', selectedPlan);
      void saveUserProfile({ is_pro: true, pro_plan: selectedPlan }).catch(() => {});
      trackSubscriptionSuccess(selectedPlan, 'expo_go', selectedPlan === 'annual' ? 'TRIAL' : 'NORMAL');
      handleClose();
      return;
    }

    setPurchaseBusy(true);
    try {
      const { purchasePlan } = await import('../integrations/purchases');
      const success = await purchasePlan(selectedPlan, paywallContext ?? 'organic');
      if (success) {
        completeAfterPurchase();
      }
    } catch (e: unknown) {
      console.error('[RevenueCat] Purchase error:', e);
      const msg = e instanceof Error ? e.message : 'Could not complete the purchase. Please try again.';
      Alert.alert('Subscription Error', msg);
    } finally {
      setPurchaseBusy(false);
    }
  };

  const selectPlan = (plan: Plan) => {
    Haptics.selectionAsync();
    setSelectedPlan(plan);
  };

  const isAnnual = selectedPlan === 'annual';
  const annualProduct = storeProducts.annual;
  const monthlyProduct = storeProducts.monthly;
  // yearlyDisplayPrice = the actual billed amount (e.g. "$59.99") — Apple requires this to be most prominent
  const annualYearlyPrice = annualProduct?.yearlyDisplayPrice ?? '$59.99';
  // displayPrice = monthly equivalent — shown subordinate below the billed amount
  const annualMonthlyEquiv = annualProduct?.displayPrice ?? '$4.99';
  const monthlyPrice = monthlyProduct?.displayPrice ?? '$12.99';

  return (
    <ScreenEnterAnimation variant="fade">
    <SafeAreaView style={styles.container}>
      {/* Content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Hero — compact */}
        <View style={styles.hero}>
          <View style={styles.iconRing}>
            <Image source={require('../../assets/logo.png')} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <Text style={styles.heroTitle}>Nouriva AI Pro</Text>
          <Text style={styles.heroSub}>Everything in one place for your meals.</Text>
        </View>

        {limitBannerText ? (
          <View style={[styles.limitBanner, { backgroundColor: C.primaryMuted, borderColor: C.primary + '35' }]}>
            <Text style={[styles.limitBannerText, { color: C.textPrimary }]}>{limitBannerText}</Text>
          </View>
        ) : null}

        {/* Minimal bullets */}
        <View style={styles.bulletBlock}>
          {FEATURE_LINES.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <Check size={14} color={C.primary} weight="bold" />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>

        {isExpoGo() ? (
          <View style={[styles.expoGoBanner, { backgroundColor: C.energyLight, borderColor: C.energy }]}>
            <Text style={[styles.expoGoBannerText, { color: C.textPrimary }]}>
              In-app purchases (Nitro) are not available in Expo Go. Use a release build from EAS, or run{' '}
              <Text style={styles.expoGoMono}>npx expo run:android</Text> to install a dev build with native
              modules. You can still continue below to test the rest of the app with a local Pro flag.
            </Text>
          </View>
        ) : null}

        {/* Plan selector */}
        <View style={styles.planRow}>
          {/* Annual */}
          <TouchableOpacity
            style={[styles.planCard, isAnnual && styles.planCardActive]}
            onPress={() => selectPlan('annual')}
            activeOpacity={0.85}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>SAVE</Text>
            </View>
            <Text style={[styles.planPeriod, isAnnual && styles.planPeriodActive]}>Yearly</Text>

            {/* Billed amount — most prominent per Apple guideline 3.1.2(c) */}
            <View style={styles.planPriceRow}>
              <Text style={[styles.planPrice, isAnnual && styles.planPriceActive]}>{annualYearlyPrice}</Text>
              <Text style={[styles.planPer, isAnnual && styles.planPerActive]}>/yr</Text>
            </View>

            {/* Monthly equivalent — subordinate size & color */}
            <Text style={[styles.planMonthlyEquiv, isAnnual && styles.planMonthlyEquivActive]} numberOfLines={1}>
              {annualMonthlyEquiv}/mo
            </Text>

            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>3-day free trial</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[styles.planCard, !isAnnual && styles.planCardActive]}
            onPress={() => selectPlan('monthly')}
            activeOpacity={0.85}
          >
            <Text style={[styles.planPeriod, !isAnnual && styles.planPeriodActive]}>Monthly</Text>
            <View style={styles.planPriceRow}>
              <Text style={[styles.planPrice, !isAnnual && styles.planPriceActive]}>{monthlyPrice}</Text>
              <Text style={[styles.planPer, !isAnnual && styles.planPerActive]}>/mo</Text>
            </View>
            <Text style={[styles.planBilled, !isAnnual && styles.planBilledActive]}>Billed monthly</Text>
            <View style={styles.trialBadgeSpacer} />
          </TouchableOpacity>
        </View>

        {/* CTA — or retry banner if store failed to load */}
        {storeError ? (
          <View style={styles.storeErrorBanner}>
            <Text style={styles.storeErrorText}>
              Could not load subscription options. Please check your connection and try again.
            </Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void loadStoreProducts()}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cta}
            onPress={handleSubscribe}
            activeOpacity={0.88}
            disabled={purchaseBusy || storeLoading}
          >
            {purchaseBusy || storeLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.ctaText}>
                {isAnnual ? 'Start free trial' : 'Subscribe'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.ctaSub}>
          {isAnnual
            ? 'Trial then renews yearly. Cancel anytime before trial ends.'
            : 'Renews monthly until you cancel.'}
        </Text>

        <Text style={styles.legalText}>
          {Platform.OS === 'android'
            ? 'Google Play billing. Cancel in Play Store → Subscriptions.'
            : 'Apple bills your Apple ID. Cancel in Settings → Subscriptions.'}
        </Text>

        <View style={styles.legalLinks}>
          {TERMS_URL ? (
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalLink}>Terms of Use</Text>
            </TouchableOpacity>
          ) : null}
          {TERMS_URL && PRIVACY_URL ? <Text style={styles.legalDot}> · </Text> : null}
          {PRIVACY_URL ? (
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={async () => {
            if (isExpoGo() || !hasConfiguredIapProducts()) {
              const stored = await SecureStore.getItemAsync('isPro');
              if (stored === 'true') {
                Alert.alert('Purchase Restored', 'Your Nouriva AI Pro subscription is active.');
                handleClose();
              } else {
                Alert.alert(
                  'No Purchase Found',
                  isExpoGo()
                    ? 'Use a dev or release build to restore real store purchases.'
                    : 'Configure App Store / Play subscriptions and EXPO_PUBLIC_IAP_* product IDs to restore real purchases.'
                );
              }
              return;
            }
            setPurchaseBusy(true);
            try {
              const { restorePurchases } = await import('../integrations/purchases');
              const restored = await restorePurchases();
              if (restored) {
                Alert.alert('Purchase Restored', 'Your Nouriva AI Pro subscription is active.');
                handleClose();
              } else {
                Alert.alert(
                  'No Subscription Found',
                  'We could not find an active subscription. If you just purchased, try again in a moment.'
                );
              }
            } catch {
              Alert.alert('Restore Failed', 'Please try again in a moment.');
            } finally {
              setPurchaseBusy(false);
            }
          }}
          style={styles.restoreBtn}
          disabled={purchaseBusy}
        >
          <Text style={styles.restoreBtnText}>Restore Purchases</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Close Button - Absolutely positioned at top */}
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleClose}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <X size={22} color={C.textPrimary} weight="bold" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    </ScreenEnterAnimation>
  );
}

function buildPlanProduct(pkg: any, plan: Plan): PlanProduct {
  const product = pkg?.product;
  if (!product) return null;

  const localizedPrice = product.priceString ?? product.localizedPrice;
  const yearlyPrice = typeof product.price === 'number' ? product.price : null;
  const currencyCode = product.currencyCode;

  if (plan === 'annual') {
    const monthlyEquiv =
      yearlyPrice != null && currencyCode
        ? formatCurrency(yearlyPrice / 12, currencyCode)
        : null;
    return {
      id: product.identifier,
      currentPlanId: pkg.identifier,
      // yearlyDisplayPrice = full billed amount — shown prominently (Apple 3.1.2c)
      yearlyDisplayPrice: localizedPrice ?? '$59.99',
      // displayPrice = monthly equivalent — shown subordinate
      displayPrice: monthlyEquiv ?? '$4.99',
      billedText: `${localizedPrice ?? '$59.99'} billed yearly`,
    };
  }

  return {
    id: product.identifier,
    currentPlanId: pkg.identifier,
    displayPrice: localizedPrice ?? '$12.99',
    billedText: 'Billed monthly',
  };
}

function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, position: 'relative' },
    topBar: { position: 'absolute', right: 12, zIndex: 9999, elevation: 20 },
    closeBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.bgSecondary, justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: C.border,
      elevation: 8,
    },
    scroll: { paddingHorizontal: 22, paddingBottom: 36 },

    // Hero
    hero: { alignItems: 'center', paddingTop: 4, paddingBottom: 20 },
    iconRing: {
      width: 84, height: 84, borderRadius: 20,
      backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
      marginBottom: 16, borderWidth: 1, borderColor: C.primaryMuted,
      overflow: 'hidden',
    },
    heroLogo: { width: 56, height: 56, borderRadius: 12 },
    heroTitle: {
      fontSize: 26, fontWeight: '800', color: C.textPrimary,
      textAlign: 'center', letterSpacing: -0.4, marginBottom: 6,
    },
    heroSub: {
      fontSize: 15, color: C.textSecondary, textAlign: 'center', lineHeight: 20,
      paddingHorizontal: 12,
    },
    limitBanner: {
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 18,
    },
    limitBannerText: { fontSize: 14, fontWeight: '600', lineHeight: 20, textAlign: 'center' },

    bulletBlock: { marginBottom: 22, paddingHorizontal: 4, gap: 10 },
    bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bulletText: { flex: 1, fontSize: 15, fontWeight: '600', color: C.textPrimary, lineHeight: 20 },

    // Plan cards
    planRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    planCard: {
      flex: 1, minHeight: 148, borderRadius: 16, padding: 14,
      backgroundColor: C.surface, borderWidth: 2, borderColor: C.border,
      alignItems: 'flex-start', position: 'relative', justifyContent: 'flex-start',
    },
    planCardActive: {
      borderColor: C.primary, backgroundColor: C.primaryLight,
    },
    bestValueBadge: {
      position: 'absolute', top: -9, right: 12,
      backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 6,
    },
    bestValueText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
    planPeriod: { fontSize: 14, fontWeight: '700', color: C.textSecondary, marginBottom: 8 },
    planPeriodActive: { color: C.primary },
    planPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1, marginBottom: 2 },
    planPrice: { fontSize: 26, fontWeight: '800', color: C.textPrimary, lineHeight: 30 },
    planPriceActive: { color: C.primaryDark },
    planPer: { fontSize: 13, color: C.textTertiary, fontWeight: '500' },
    planPerActive: { color: C.primaryDark },
    planBilled: { fontSize: 11, color: C.textTertiary, fontWeight: '500', marginBottom: 8 },
    planBilledActive: { color: C.textSecondary },
    // Monthly equivalent shown under yearly price — smaller & muted (subordinate per Apple 3.1.2c)
    planMonthlyEquiv: { fontSize: 11, color: C.textTertiary, fontWeight: '500', marginBottom: 8 },
    planMonthlyEquivActive: { color: C.textSecondary },
    trialBadge: {
      backgroundColor: C.vitalityLight, paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 8,
    },
    trialBadgeText: { color: C.vitality, fontSize: 11, fontWeight: '700' },
    trialBadgeSpacer: { height: 28, marginBottom: 0 },

    // Store error / retry
    storeErrorBanner: {
      borderRadius: 14, borderWidth: 1, borderColor: C.border,
      backgroundColor: C.surface, padding: 16, alignItems: 'center',
      marginBottom: 8, gap: 12,
    },
    storeErrorText: {
      fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20,
    },
    retryBtn: {
      backgroundColor: C.primary, borderRadius: 10,
      paddingVertical: 10, paddingHorizontal: 28,
    },
    retryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

    // CTA
    cta: {
      backgroundColor: C.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center', marginBottom: 8,
    },
    ctaText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
    ctaSub: {
      fontSize: 12, color: C.textTertiary, textAlign: 'center',
      lineHeight: 16, marginBottom: 16, fontWeight: '500',
    },

    // Legal
    legalText: {
      fontSize: 11, color: C.textTertiary, textAlign: 'center',
      lineHeight: 15, paddingHorizontal: 4, marginBottom: 10,
    },
    legalLinks: {
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
      alignItems: 'center', marginBottom: 12, paddingHorizontal: 12,
    },
    legalLink: { fontSize: 11, color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
    legalDot: { fontSize: 11, color: C.textTertiary },
    restoreBtn: { alignItems: 'center', paddingVertical: 14 },
    restoreBtnText: { fontSize: 13, color: C.textTertiary, fontWeight: '600', textDecorationLine: 'underline' },
    expoGoBanner: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 18,
    },
    expoGoBannerText: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
    expoGoMono: { fontFamily: 'monospace' },
  });
}
