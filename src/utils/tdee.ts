import type { DailyGoals } from './goals';

/** Mifflin–St Jeor sex term: male +5, female −161 */
export type Sex = 'male' | 'female';

export type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** Applied to TDEE: maintenance, ~15% deficit, ~20% deficit */
export type CalorieGoalMode = 'maintain' | 'mild_loss' | 'moderate_loss';

const ACTIVITY_MULTIPLIER: Record<ActivityKey, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_FACTOR: Record<CalorieGoalMode, number> = {
  maintain: 1,
  mild_loss: 0.85,
  moderate_loss: 0.8,
};

export const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  sedentary: 'Sedentary (desk / little exercise)',
  light: 'Light (1–3 days/week)',
  moderate: 'Moderate (3–5 days/week)',
  active: 'Active (6–7 days/week)',
  very_active: 'Very active (athlete / physical job)',
};

export const GOAL_LABELS: Record<CalorieGoalMode, string> = {
  maintain: 'Maintain weight',
  mild_loss: 'Mild fat loss (~15% below TDEE)',
  moderate_loss: 'Moderate fat loss (~20% below TDEE)',
};

export interface MetabolicInputs {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityKey;
  calorieGoal: CalorieGoalMode;
}

/** BMR in kcal/day (Mifflin–St Jeor, 1990). */
export function mifflinStJeorBmr(weightKg: number, heightCm: number, ageYears: number, sex: Sex): number {
  const linear = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? linear + 5 : linear - 161;
}

const MACRO_PCT = { protein: 0.3, fat: 0.3, carbs: 0.4 } as const;

/**
 * P/F/C from % of the same calorie target: 30% / 30% / 40% (each rounded independently;
 * total kcal may differ by a few from rounding — typical for app UX).
 * Not medical advice.
 */
export function dailyMacrosFromCalories(calories: number): Pick<DailyGoals, 'protein' | 'carbs' | 'fats'> {
  const c = Math.max(800, Math.min(6000, Math.round(calories)));
  const protein = Math.max(20, Math.round((c * MACRO_PCT.protein) / 4));
  const fats = Math.max(20, Math.round((c * MACRO_PCT.fat) / 9));
  const carbs = Math.max(40, Math.round((c * MACRO_PCT.carbs) / 4));
  return { protein, carbs, fats };
}

/** Same calorie clamp as `computeDailyGoalsFromMetabolicInputs` (TDEE × goal factor). */
export function computeTargetCaloriesFromMetabolicInputs(input: MetabolicInputs): number {
  const bmr = mifflinStJeorBmr(input.weightKg, input.heightCm, input.ageYears, input.sex);
  const tdee = bmr * ACTIVITY_MULTIPLIER[input.activity];
  let calories = Math.round(tdee * GOAL_FACTOR[input.calorieGoal]);
  return Math.max(1200, Math.min(6000, calories));
}

/**
 * TDEE-based daily targets. Calories = clamp(TDEE × goal factor).
 * Macros: 30% kcal protein, 30% fat, 40% carbs (by calories).
 * Not medical advice — rough estimate for app UX only.
 */
export function computeDailyGoalsFromMetabolicInputs(input: MetabolicInputs): DailyGoals {
  const calories = computeTargetCaloriesFromMetabolicInputs(input);
  const { protein, carbs, fats } = dailyMacrosFromCalories(calories);
  return { calories, protein, carbs, fats };
}

const ACTIVITY_KEYS: ActivityKey[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const CALORIE_GOAL_KEYS: CalorieGoalMode[] = ['maintain', 'mild_loss', 'moderate_loss'];

/**
 * Parse Supabase jsonb / SecureStore JSON into MetabolicInputs, or null if invalid.
 */
export function parseMetabolicInputs(raw: unknown): MetabolicInputs | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const sex = o.sex === 'male' || o.sex === 'female' ? o.sex : null;
  const ageYears = typeof o.ageYears === 'number' ? o.ageYears : parseInt(String(o.ageYears ?? ''), 10);
  const heightCm = typeof o.heightCm === 'number' ? o.heightCm : parseFloat(String(o.heightCm ?? ''));
  const weightKg = typeof o.weightKg === 'number' ? o.weightKg : parseFloat(String(o.weightKg ?? ''));
  const activity =
    typeof o.activity === 'string' && ACTIVITY_KEYS.includes(o.activity as ActivityKey)
      ? (o.activity as ActivityKey)
      : null;
  const calorieGoal =
    typeof o.calorieGoal === 'string' && CALORIE_GOAL_KEYS.includes(o.calorieGoal as CalorieGoalMode)
      ? (o.calorieGoal as CalorieGoalMode)
      : null;
  if (!sex || !Number.isFinite(ageYears) || ageYears < 10 || ageYears > 120) return null;
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) return null;
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return null;
  if (!activity || !calorieGoal) return null;
  return { sex, ageYears, heightCm, weightKg, activity, calorieGoal };
}

export const METABOLIC_INPUTS_KEY = 'metabolicInputs';
