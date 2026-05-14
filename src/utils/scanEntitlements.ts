/**
 * Shared gate before spending LLM / saving a scan — must match Scanner + any other scan entry points.
 */
import * as SecureStore from 'expo-secure-store';
import { InteractionManager } from 'react-native';
import { refreshProFromRemote } from '../integrations/purchases';
import { isTrialActive } from './trialStatus';
import { getScanCount, getTodayScanCount } from './history';

export type ScanPaywallContext = 'trial_scan_limit' | 'daily_scan_limit';

/** Cached Pro short-circuits; otherwise refresh via RC + Supabase `user_profiles.is_pro` before limits. */
export async function resolveIsProForScan(): Promise<boolean> {
  if ((await SecureStore.getItemAsync('isPro')) === 'true') return true;
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => InteractionManager.runAfterInteractions(() => r()));
  try {
    return await refreshProFromRemote();
  } catch (e) {
    console.warn('[scanEntitlements] refreshProFromRemote failed; using cached isPro', e);
    return (await SecureStore.getItemAsync('isPro')) === 'true';
  }
}

/**
 * @returns whether the user may start a new scan/analysis under free-tier rules.
 * Pro (Supabase / RC / cache) always allowed.
 */
export async function checkFreeTierScanAllowed(): Promise<
  { allowed: true } | { allowed: false; paywallContext: ScanPaywallContext }
> {
  const isPro = await resolveIsProForScan();
  if (isPro) return { allowed: true };

  const trialActive = await isTrialActive();
  if (trialActive) {
    const totalCount = await getScanCount();
    if (totalCount >= 20) return { allowed: false, paywallContext: 'trial_scan_limit' };
  } else {
    const todayCount = await getTodayScanCount();
    if (todayCount >= 1) return { allowed: false, paywallContext: 'daily_scan_limit' };
  }
  return { allowed: true };
}
