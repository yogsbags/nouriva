-- Sync Smart goals TDEE inputs (age, sex, height, weight, activity, calorie goal) across devices.
-- Client shape matches `MetabolicInputs` in src/utils/tdee.ts, e.g.:
-- {"sex":"male","ageYears":35,"heightCm":175,"weightKg":75,"activity":"moderate","calorieGoal":"mild_loss"}

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS metabolic_inputs jsonb DEFAULT NULL;

COMMENT ON COLUMN public.user_profiles.metabolic_inputs IS
  'Smart goals / Mifflin–St Jeor inputs; mirrors SecureStore metabolicInputs for cross-device sync.';
