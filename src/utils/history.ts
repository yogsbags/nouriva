import { supabase } from './supabase';

export interface FoodLog {
  id: string;
  user_id: string;
  food_name: string;
  vitality_score: number;
  image_url?: string;
  image_base64?: string;
  steps?: number;
  heart_rate?: number;
  sleep_hours?: number;
  /** Latest weight (kg) from Health at scan time, if available */
  weight_kg?: number;
  macros?: {
    calories: string;
    protein: string;
    fats: string;
    carbs: string;
  };
  systemic_data?: any[];
  organ_data?: any[];
  alerts?: any[];
  balancer_suggestions?: any[];
  biochemicals?: any[];
  refs?: any[];
  glucose_peak?: number;
  glucose_excursion?: number;
  glucose_insulin_peak?: number;
  glucose_recovery_min?: number;
  created_at: string;
}

export interface GlucoseSim {
  peakGlucose: number;
  excursion: number;
  peakInsulin: number;
  recoveryMin: number;
}

export async function saveFoodLog(
  foodName: string,
  vitalityScore: number,
  imageUrl?: string,
  imageBase64?: string,
  health?: { steps: number; heartRate: number; sleepHours: number; weight?: number },
  macros?: { calories: string; protein: string; fats: string; carbs: string },
  scanResult?: {
    systemicData?: any[];
    organData?: any[];
    alerts?: any[];
    balancerSuggestions?: any[];
    biochemicals?: any[];
    refs?: any[];
  },
  glucoseSim?: GlucoseSim,
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('food_logs')
      .insert([{
        user_id: session.user.id,
        food_name: foodName,
        vitality_score: vitalityScore,
        image_url: imageUrl ?? null,
        image_base64: imageBase64 ?? null,
        steps: health?.steps,
        heart_rate: health?.heartRate,
        sleep_hours: health?.sleepHours,
        weight_kg:
          health?.weight != null && health.weight > 0 ? health.weight : null,
        macros,
        systemic_data: scanResult?.systemicData ?? null,
        organ_data: scanResult?.organData ?? null,
        alerts: scanResult?.alerts ?? null,
        balancer_suggestions: scanResult?.balancerSuggestions ?? null,
        biochemicals: scanResult?.biochemicals ?? null,
        refs: scanResult?.refs ?? null,
        glucose_peak: glucoseSim?.peakGlucose ?? null,
        glucose_excursion: glucoseSim?.excursion ?? null,
        glucose_insulin_peak: glucoseSim?.peakInsulin ?? null,
        glucose_recovery_min: glucoseSim?.recoveryMin ?? null,
      }]);

    if (error) throw error;

    void import('./profileHeaderCache').then(({ warmProfileHeaderCache }) => warmProfileHeaderCache());
  } catch (error) {
    console.error('Error saving food log:', error);
  }
}

export async function getScanCount(): Promise<number> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 0;
    
    const { count, error } = await supabase
      .from('food_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting scan count:', error);
    return 0;
  }
}

export async function getTodayScanCount(): Promise<number> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 0;
    
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const { count, error } = await supabase
      .from('food_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', startOfDay.toISOString());

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting today scan count:', error);
    return 0;
  }
}

export async function getFoodLogs(): Promise<FoodLog[]> {
  try {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching food logs:', error);
    return [];
  }
}

export async function deleteFoodLog(id: string) {
  try {
    const { error } = await supabase
      .from('food_logs')
      .delete()
      .match({ id });

    if (error) throw error;

    void import('./profileHeaderCache').then(({ warmProfileHeaderCache }) => warmProfileHeaderCache());
    return true;
  } catch (error) {
    console.error('Error deleting food log:', error);
    return false;
  }
}
