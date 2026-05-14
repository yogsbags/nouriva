/**
 * If upsert fails, run in Supabase SQL:
 * ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
 * ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
 * ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pro_plan text;
 * ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS health_sync_enabled boolean DEFAULT false;
 * ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS metabolic_inputs jsonb DEFAULT NULL;
 *
 * Note: `is_pro` from the client is for UX / cross-device sync only. For fraud-proof billing,
 * validate App Store / Play receipts on a backend and set entitlement server-side.
 */
import { supabase } from './supabase';
import * as SecureStore from 'expo-secure-store';
import { DailyGoals } from './goals';
import { METABOLIC_INPUTS_KEY, parseMetabolicInputs, type MetabolicInputs } from './tdee';

export type ProPlan = 'annual' | 'monthly';

export interface UserProfile {
  health_goal?: string;
  medical_conditions?: string[];
  health_context?: string;
  report_insights?: string;
  daily_goals?: DailyGoals;
  /** Smart goals / TDEE inputs; synced via `metabolic_inputs` on user_profiles. */
  metabolic_inputs?: MetabolicInputs;
  /** Public URL from Supabase Storage (optional; local file is primary on device). */
  avatar_url?: string | null;
  /** Mirrored from purchases; also see SecureStore `isPro`. */
  is_pro?: boolean;
  pro_plan?: ProPlan | null;
  /** User granted HealthKit / Health Connect read access (preference flag). */
  health_sync_enabled?: boolean;
  onboarding_completed?: boolean;
  created_at?: string;
}

export async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function loadUserProfile(): Promise<UserProfile | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const metabolicRaw = (data as { metabolic_inputs?: unknown }).metabolic_inputs;
  const metabolic_inputs = parseMetabolicInputs(metabolicRaw) ?? undefined;

  const isPro = typeof data.is_pro === 'boolean' ? data.is_pro : false;
  const proPlan = data.pro_plan === 'annual' || data.pro_plan === 'monthly' ? data.pro_plan : null;
  const createdAt = data.created_at || new Date().toISOString();

  // Auto-sync to SecureStore for immediate UI updates across all screens
  void SecureStore.setItemAsync('isPro', isPro ? 'true' : 'false').catch(() => {});
  void SecureStore.setItemAsync('accountCreatedAt', createdAt).catch(() => {});
  if (proPlan) void SecureStore.setItemAsync('proplan', proPlan).catch(() => {});
  else void SecureStore.deleteItemAsync('proplan').catch(() => {});

  return {
    health_goal: data.health_goal ?? undefined,
    medical_conditions: data.medical_conditions ?? undefined,
    health_context: data.health_context ?? undefined,
    report_insights: data.report_insights ?? undefined,
    daily_goals: data.daily_goals ?? undefined,
    metabolic_inputs,
    avatar_url: data.avatar_url ?? undefined,
    is_pro: isPro,
    pro_plan: proPlan,
    health_sync_enabled: typeof data.health_sync_enabled === 'boolean' ? data.health_sync_enabled : undefined,
    onboarding_completed: typeof data.onboarding_completed === 'boolean' ? data.onboarding_completed : undefined,
  };
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const payload: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (profile.health_goal !== undefined) payload.health_goal = profile.health_goal;
  if (profile.medical_conditions !== undefined) payload.medical_conditions = profile.medical_conditions;
  if (profile.health_context !== undefined) payload.health_context = profile.health_context;
  if (profile.report_insights !== undefined) payload.report_insights = profile.report_insights;
  if (profile.daily_goals !== undefined) payload.daily_goals = profile.daily_goals;
  if (profile.metabolic_inputs !== undefined) payload.metabolic_inputs = profile.metabolic_inputs;
  if (profile.avatar_url !== undefined) payload.avatar_url = profile.avatar_url === '' ? null : profile.avatar_url;
  if (profile.is_pro !== undefined) payload.is_pro = profile.is_pro;
  if (profile.pro_plan !== undefined) payload.pro_plan = profile.pro_plan;
  if (profile.health_sync_enabled !== undefined) payload.health_sync_enabled = profile.health_sync_enabled;
  if (profile.onboarding_completed !== undefined) payload.onboarding_completed = profile.onboarding_completed;

  const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) console.warn('saveUserProfile:', error.message);

  // Mirror to SecureStore so offline reads stay consistent
  if (profile.medical_conditions !== undefined)
    await SecureStore.setItemAsync('medicalConditions', JSON.stringify(profile.medical_conditions));
  if (profile.health_context !== undefined)
    await SecureStore.setItemAsync('healthContext', profile.health_context);
  if (profile.report_insights !== undefined)
    await SecureStore.setItemAsync('reportInsights', profile.report_insights ?? '');
  if (profile.health_goal !== undefined)
    await SecureStore.setItemAsync('healthGoal', profile.health_goal ?? '');
  if (profile.is_pro !== undefined)
    await SecureStore.setItemAsync('isPro', profile.is_pro ? 'true' : 'false');
  if (profile.pro_plan !== undefined)
    await SecureStore.setItemAsync('proplan', profile.pro_plan ?? '');
  if (profile.health_sync_enabled !== undefined)
    await SecureStore.setItemAsync('healthSyncEnabled', profile.health_sync_enabled ? 'true' : 'false');
  if (profile.metabolic_inputs !== undefined) {
    await SecureStore.setItemAsync(METABOLIC_INPUTS_KEY, JSON.stringify(profile.metabolic_inputs));
  }
}
