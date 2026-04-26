import * as SecureStore from 'expo-secure-store';

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

const DEFAULTS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fats: 65,
};

const KEY = 'dailyGoals';

/**
 * Onboarding "Primary Protocol" → daily targets (starting point; user can edit in Profile).
 * Rough presets: weight_loss = modest deficit + higher protein share; metabolic = lower glycemic load;
 * gut = moderate carb/fiber-friendly; cognitive = balanced with stable glucose;
 * longevity = Mediterranean-style balance. (User can refine numbers in Profile.)
 */
export const HEALTH_GOAL_PRESETS: Record<string, DailyGoals> = {
  weight_loss: { calories: 1700, protein: 145, carbs: 160, fats: 58 },
  metabolic: { calories: 1900, protein: 155, carbs: 185, fats: 72 },
  gut: { calories: 2000, protein: 140, carbs: 230, fats: 68 },
  cognitive: { calories: 2000, protein: 150, carbs: 235, fats: 65 },
  longevity: { calories: 2000, protein: 140, carbs: 245, fats: 68 },
};

export function dailyGoalsForHealthGoal(goalId: string | undefined | null): DailyGoals {
  if (!goalId) return { ...DEFAULTS };
  const preset = HEALTH_GOAL_PRESETS[goalId];
  return preset ? { ...preset } : { ...DEFAULTS };
}

export async function getDailyGoals(): Promise<DailyGoals> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export async function saveDailyGoals(goals: DailyGoals): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(goals));
}
