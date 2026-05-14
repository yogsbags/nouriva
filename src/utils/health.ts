import { NativeModules, Platform } from 'react-native';
import * as Device from 'expo-device';
import { isIosSimulator } from './iosSimulator';

type IosHealthNative = {
  initHealthKit: (
    permissions: { permissions: { read: string[]; write: string[] } },
    cb: (err: string) => void
  ) => void;
  getStepCount: (opts: { date?: string }, cb: (err: object, res: { value: number }) => void) => void;
  getRestingHeartRateSamples: (
    opts: { unit?: string; startDate: string; endDate: string; limit?: number },
    cb: (err: object, res: Array<{ value: number }>) => void
  ) => void;
  getSleepSamples: (
    opts: { startDate: string; endDate?: string },
    cb: (err: object, res: Array<{ startDate: string; endDate: string; value: string }>) => void
  ) => void;
  getLatestWeight: (opts: { unit: string }, cb: (err: object, res: { value: number }) => void) => void;
  saveFood: (
    opts: {
      name: string;
      calories: number;
      carbohydrates: number;
      protein: number;
      totalFat: number;
      saturatedFat?: number;
      dietaryFiber?: number;
      sodium?: number;
      sugar?: number;
      water?: number;
    },
    cb: (err: object, res: object) => void
  ) => void;
};

/**
 * `react-native-health` only works when the native iOS module is in the binary (EAS / `expo run:ios`).
 * Expo Go does not include it; we return null and use default stats with no console noise.
 *
 * New Architecture: the package's `index.js` does `Object.assign({}, NativeModules.AppleHealthKit)`.
 * HostObject / legacy interop modules often expose methods that are not copied by `assign`, so
 * `require('react-native-health').initHealthKit` is undefined even though the native module works.
 * Prefer `NativeModules.AppleHealthKit` first, then fall back to the package for old bridge behavior.
 */
function getIosHealthNativeOrNull(): IosHealthNative | null {
  if (Platform.OS !== 'ios') return null;

  try {
    const kit = NativeModules.AppleHealthKit as Partial<IosHealthNative> | undefined;
    if (kit != null && typeof kit.initHealthKit === 'function') {
      return kit as IosHealthNative;
    }
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('react-native-health') as Partial<IosHealthNative>;
    if (m && typeof m.initHealthKit === 'function') return m as IosHealthNative;
  } catch {
    return null;
  }

  return null;
}

/**
 * Collects HealthKit diagnostic information for debugging.
 * Shows whether the native module is linked, what keys are exported,
 * and what happens when initHealthKit is called.
 * Returns a human-readable string suitable for displaying in an Alert.
 */
export async function getHealthDebugInfo(): Promise<string> {
  if (Platform.OS !== 'ios') return 'Platform: ' + Platform.OS + ' (not iOS)';

  const lines: string[] = [];
  lines.push('Expo Device.isDevice: ' + String(Device.isDevice));
  lines.push('isIosSimulator(): ' + String(isIosSimulator()));

  // 1. Check NativeModules (keys may be empty on New Arch proxy; use `'in'` / direct access too)
  try {
    const allKeys = Object.keys(NativeModules as object);
    const healthKeys = allKeys.filter(k =>
      k.toLowerCase().includes('health') ||
      k.toLowerCase().includes('rnfb') ||
      k.toLowerCase().includes('apple')
    );
    lines.push('NativeModules total: ' + allKeys.length);
    lines.push('Health-related: ' + (healthKeys.length ? healthKeys.join(', ') : 'NONE'));
    lines.push('AppleHealthKit in NM: ' + ('AppleHealthKit' in NativeModules ? 'YES ✓' : 'NO ✗'));
  } catch (e) {
    lines.push('NativeModules error: ' + String(e));
  }

  // 2. Check react-native-health re-export (often broken on New Arch — compare to direct NM)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('react-native-health') as Record<string, unknown>;
    const mKeys = Object.keys(m || {});
    lines.push('RNH module keys: ' + (mKeys.length ? mKeys.slice(0, 8).join(', ') + (mKeys.length > 8 ? '…' : '') : 'EMPTY'));
    lines.push('initHealthKit fn: ' + (typeof m?.initHealthKit === 'function' ? 'YES ✓' : 'NO ✗ (' + typeof m?.initHealthKit + ')'));
  } catch (e) {
    lines.push('require(rn-health) threw: ' + String(e));
  }

  // 2b. Check NativeModules.AppleHealthKit directly (New Arch path)
  try {
    const kit = NativeModules['AppleHealthKit'] as Record<string, unknown> | undefined;
    if (kit) {
      const kitKeys = Object.keys(kit);
      lines.push('NM.AppleHealthKit keys: ' + (kitKeys.length ? kitKeys.slice(0, 6).join(', ') + (kitKeys.length > 6 ? '…' : '') : 'EMPTY'));
      lines.push('NM.AHK.initHealthKit: ' + (typeof kit.initHealthKit === 'function' ? 'YES ✓' : 'NO ✗ (' + typeof kit.initHealthKit + ')'));
    } else {
      lines.push('NM.AppleHealthKit: undefined');
    }
  } catch (e) {
    lines.push('NM direct access error: ' + String(e));
  }

  lines.push('getIosHealthNativeOrNull: ' + (getIosHealthNativeOrNull() ? 'YES ✓' : 'NO ✗'));

  if (isIosSimulator()) {
    lines.push('initHealthKit call: SKIPPED (Simulator — unstable HealthKit; device uses full API).');
    return lines.join('\n');
  }

  // 3. Try calling initHealthKit and capture the exact error
  const native = getIosHealthNativeOrNull();
  if (!native) {
    lines.push('initHealthKit call: SKIPPED (module null)');
  } else {
    const result = await new Promise<string>((resolve) => {
      try {
        native.initHealthKit(
          {
            permissions: {
              read: ['StepCount', 'HeartRate'],
              write: ['EnergyConsumed'],
            },
          },
          (err: string) => {
            if (err) {
              resolve('CB error: ' + JSON.stringify(err));
            } else {
              resolve('CB success ✓');
            }
          }
        );
      } catch (e) {
        resolve('initHK threw: ' + String(e));
      }
    });
    lines.push('initHealthKit result: ' + result);
  }

  return lines.join('\n');
}

/**
 * Standardized health stats for scan context (steps, HR, sleep, weight).
 * iOS: Apple Health via `react-native-health`.
 * Android: Health Connect via `react-native-health-connect`.
 * Web / missing permissions / errors: falls back to neutral defaults (not mock marketing numbers).
 */

export interface HealthStats {
  steps: number;
  heartRate: number;
  sleepHours: number;
  weight: number;
}

const DEFAULT_STATS: HealthStats = {
  steps: 0,
  heartRate: 0,
  sleepHours: 0,
  weight: 0,
};

function dayRange() {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function lastDaysRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    operator: 'between' as const,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

let iosHealthKitInitialized = false;

async function initIosHealthKit(): Promise<boolean> {
  if (isIosSimulator()) return false;

  const native = getIosHealthNativeOrNull();
  if (!native) {
    console.warn('[Health] react-native-health native module not available (null). Check HealthKit entitlement and App ID capability in Apple Developer Portal.');
    return false;
  }
  if (iosHealthKitInitialized) return true;
  try {
    await new Promise<void>((resolve, reject) => {
      native.initHealthKit(
        {
          permissions: {
            read: ['StepCount', 'HeartRate', 'SleepAnalysis', 'RestingHeartRate', 'Weight', 'ActiveEnergyBurned', 'Height', 'BodyMassIndex'],
            write: ['EnergyConsumed', 'Carbohydrates', 'Protein', 'TotalFat', 'SaturatedFat', 'DietaryFiber', 'Sodium', 'Sugar', 'Water', 'Weight'],
          },
        },
        (err: string) => {
          if (err) {
            console.warn('[Health] initHealthKit callback error:', JSON.stringify(err));
            reject(new Error(typeof err === 'string' ? err : JSON.stringify(err)));
          } else {
            resolve();
          }
        }
      );
    });
    iosHealthKitInitialized = true;
    return true;
  } catch (e) {
    console.warn('[Health] HealthKit init failed:', e);
    return false;
  }
}

function promisifyStepCount(): Promise<number> {
  const AppleHealthKit = getIosHealthNativeOrNull();
  if (!AppleHealthKit) return Promise.resolve(0);
  return new Promise((resolve) => {
    AppleHealthKit.getStepCount({ date: new Date().toISOString() }, (err: object, results: { value: number }) => {
      if (err || results == null) resolve(0);
      else resolve(Math.round(results.value ?? 0));
    });
  });
}

function promisifyLatestRestingHr(): Promise<number> {
  const AppleHealthKit = getIosHealthNativeOrNull();
  if (!AppleHealthKit) return Promise.resolve(0);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return new Promise((resolve) => {
    AppleHealthKit.getRestingHeartRateSamples(
      { unit: 'bpm', startDate: start.toISOString(), endDate: end.toISOString(), limit: 1 },
      (err: object, res: Array<{ value: number }>) => {
        if (err || !res?.length) resolve(0);
        else resolve(Math.round(res[0].value));
      }
    );
  });
}

function promisifySleepHours(): Promise<number> {
  const AppleHealthKit = getIosHealthNativeOrNull();
  if (!AppleHealthKit) return Promise.resolve(0);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 2);
  return new Promise((resolve) => {
    AppleHealthKit.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() },
      (err: object, res: Array<{ startDate: string; endDate: string; value: string }>) => {
        if (err || !res?.length) {
          resolve(0);
          return;
        }
        let asleepMs = 0;
        for (const s of res) {
          if (s.value === 'ASLEEP' || s.value === 'DEEP' || s.value === 'REM' || s.value === 'CORE') {
            const a = new Date(s.startDate).getTime();
            const b = new Date(s.endDate).getTime();
            if (b > a) asleepMs += b - a;
          }
        }
        resolve(asleepMs > 0 ? asleepMs / 3600000 : 0);
      }
    );
  });
}

function promisifyLatestWeight(): Promise<number> {
  const AppleHealthKit = getIosHealthNativeOrNull();
  if (!AppleHealthKit) return Promise.resolve(0);
  return new Promise((resolve) => {
    AppleHealthKit.getLatestWeight({ unit: 'kg' }, (err: object, res: { value: number }) => {
      if (err || res?.value == null) resolve(0);
      else resolve(Math.round(res.value * 10) / 10);
    });
  });
}

async function fetchIosHealthStats(): Promise<HealthStats> {
  const ok = await initIosHealthKit();
  if (!ok) return { ...DEFAULT_STATS };
  const [steps, heartRate, sleepHours, weight] = await Promise.all([
    promisifyStepCount(),
    promisifyLatestRestingHr(),
    promisifySleepHours(),
    promisifyLatestWeight(),
  ]);
  return { steps, heartRate, sleepHours, weight };
}

async function fetchAndroidHealthStats(): Promise<HealthStats> {
  try {
    const {
      initialize,
      getSdkStatus,
      requestPermission,
      aggregateRecord,
      SdkAvailabilityStatus,
    } = await import('react-native-health-connect');

    // Always initialize first to avoid "lateinit property permissions" crash in native
    try {
      if (typeof initialize !== 'function') {
        console.warn('[Health] Health Connect initialize is not a function');
        return { ...DEFAULT_STATS };
      }
      await initialize();
      // Brief delay to ensure native state is settled
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.warn('[Health] Failed to initialize Health Connect', e);
      return { ...DEFAULT_STATS };
    }

    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      return { ...DEFAULT_STATS };
    }

    // DO NOT call requestPermission here. It should only be called via requestHealthPermissions()
    // when the user explicitly interacts with the UI. Calling it here causes crashes 
    // on some devices/emulators if the SDK state is not perfectly initialized.

    const range = dayRange();
    const weekRange = lastDaysRange(7);

    let steps = 0;
    let heartRate = 0;
    let sleepHours = 0;

    try {
      const [stepsAgg, hrAgg, sleepAgg] = await Promise.all([
        aggregateRecord({ recordType: 'Steps', timeRangeFilter: range }),
        aggregateRecord({ recordType: 'RestingHeartRate', timeRangeFilter: weekRange }),
        aggregateRecord({ recordType: 'SleepSession', timeRangeFilter: lastDaysRange(2) }),
      ]);

      steps = 'COUNT_TOTAL' in stepsAgg ? (stepsAgg as { COUNT_TOTAL: number }).COUNT_TOTAL : 0;
      heartRate =
        'BPM_AVG' in hrAgg && typeof (hrAgg as { BPM_AVG: number }).BPM_AVG === 'number'
          ? Math.round((hrAgg as { BPM_AVG: number }).BPM_AVG)
          : 0;
      const sleepRaw = 'SLEEP_DURATION_TOTAL' in sleepAgg ? (sleepAgg as { SLEEP_DURATION_TOTAL: number }).SLEEP_DURATION_TOTAL : 0;
      /** Health Connect sleep duration is in milliseconds */
      sleepHours = sleepRaw > 0 ? sleepRaw / 3600000 : 0;
    } catch (e: any) {
      if (e?.message?.includes('SecurityException') || e?.message?.includes('permission')) {
        console.warn('[Health] Missing permissions for some metrics, using partial data');
      } else {
        console.error('[Health] Failed to aggregate Health Connect data', e);
      }
    }

    let weight = 0;
    try {
      const wAgg = await aggregateRecord({ recordType: 'Weight', timeRangeFilter: weekRange });
      if ('WEIGHT_AVG' in wAgg && (wAgg as { WEIGHT_AVG: { inKilograms: number } }).WEIGHT_AVG?.inKilograms != null) {
        weight = Math.round((wAgg as { WEIGHT_AVG: { inKilograms: number } }).WEIGHT_AVG.inKilograms * 10) / 10;
      }
    } catch {
      /* optional */
    }

    return {
      steps: Math.round(steps),
      heartRate,
      sleepHours: Math.round(sleepHours * 10) / 10,
      weight,
    };
  } catch (e) {
    console.warn('[Health] Android Health Connect', e);
    return { ...DEFAULT_STATS };
  }
}

/** Request HealthKit / Health Connect permissions (shows system UI when needed). */
export const requestHealthPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'ios') {
    return initIosHealthKit();
  }
  // Android: react-native-health-connect v3.x crashes if requestPermission() is called
  // after the Activity is already RESUMED (IllegalStateException: LifecycleOwner attempting
  // to register while current state is RESUMED). The safe alternative is to open the
  // Health Connect settings page so the user grants permissions there, then we check status
  // when they return.
  try {
    const hc = await import('react-native-health-connect');
    const { initialize, getSdkStatus, SdkAvailabilityStatus, openHealthConnectSettings } = hc;

    if (typeof initialize !== 'function') return false;

    try {
      await initialize();
    } catch (e) {
      console.warn('[Health] Failed to initialize Health Connect', e);
      return false;
    }

    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) {
      // Health Connect not installed — open Play Store to install it
      if (typeof hc.openHealthConnectDataManagement === 'function') {
        await hc.openHealthConnectDataManagement();
      }
      return false;
    }

    // Open Health Connect settings so user can grant permissions manually.
    // This avoids the native crash from calling requestPermission() after async awaits.
    if (typeof openHealthConnectSettings === 'function') {
      await openHealthConnectSettings();
    }
    // Return true optimistically — fetchAndroidHealthStats will get real data on next scan.
    return true;
  } catch (e) {
    console.warn('[Health] request permissions', e);
    return false;
  }
};

export const fetchHealthStats = async (): Promise<HealthStats> => {
  if (Platform.OS === 'web') return { ...DEFAULT_STATS };
  if (Platform.OS === 'ios') return fetchIosHealthStats();
  if (Platform.OS === 'android') return fetchAndroidHealthStats();
  return { ...DEFAULT_STATS };
};

/** Latest weight in kg from HealthKit / Health Connect, or null if unavailable. */
export async function fetchLatestWeightKg(): Promise<number | null> {
  const s = await fetchHealthStats();
  if (s.weight > 0) return s.weight;
  return null;
}

export interface NutritionEntry {
  name: string;
  calories: number;      // kcal
  carbs: number;         // g
  protein: number;       // g
  fat: number;           // g
  saturatedFat?: number; // g
  fiber?: number;        // g
  sodium?: number;       // mg
  sugar?: number;        // g
  water?: number;        // ml
}

/**
 * Write a food entry's nutrition to Apple Health (iOS only).
 * Shows up under Health > Nutrition — same as Cal AI, Cronometer, etc.
 * No-ops silently on Android / web / if HealthKit isn't initialized.
 */
export async function writeNutritionToAppleHealth(entry: NutritionEntry): Promise<void> {
  if (Platform.OS !== 'ios') return;

  // Keys MUST match react-native-health native saveFood (RCTAppleHealthKit+Methods_Dietary.m).
  // Wrong keys leave foodName nil; @{ HKMetadataKeyFoodType: nil } raises NSException → app crash.
  const foodName = String(entry.name ?? 'Meal').trim() || 'Meal';
  const calories = Math.max(0, entry.calories);
  const carbs = Math.max(0, entry.carbs);
  const protein = Math.max(0, entry.protein);
  const fat = Math.max(0, entry.fat);
  if (calories <= 0 && carbs <= 0 && protein <= 0 && fat <= 0) return;

  const ok = await initIosHealthKit();
  if (!ok) return;
  const native = getIosHealthNativeOrNull();
  if (!native || typeof native.saveFood !== 'function') return;

  const opts: Record<string, string | number> = {
    foodName,
    mealType: 'Snack',
    energy: calories,
    carbohydrates: carbs,
    protein,
    fatTotal: fat,
  };
  if (entry.saturatedFat != null && entry.saturatedFat > 0) opts.fatSaturated = entry.saturatedFat;
  if (entry.fiber != null && entry.fiber > 0) opts.fiber = entry.fiber;
  if (entry.sodium != null && entry.sodium > 0) opts.sodium = entry.sodium / 1000;
  if (entry.sugar != null && entry.sugar > 0) opts.sugar = entry.sugar;

  await new Promise<void>((resolve) => {
    native.saveFood(opts as Parameters<IosHealthNative['saveFood']>[0], (err) => {
      if (err) console.warn('[Health] saveFood error:', err);
      resolve();
    });
  });
}

export const getHealthImpactAnalysis = (stats: HealthStats, foodScore: number) => {
  const hasVitals = stats.heartRate > 0 || stats.sleepHours > 0 || stats.steps > 0;

  // Vitals-aware messages (only when we have real health data)
  if (hasVitals) {
    if (stats.heartRate > 80 && foodScore < 5) {
      return 'Your elevated resting heart rate combined with this meal may increase cardiovascular load. Consider lighter, anti-inflammatory options.';
    }
    if (stats.sleepHours < 6 && stats.sleepHours > 0 && foodScore < 6) {
      return 'Sleep deprivation has already stressed your metabolic pathways. This item may trigger a sharper glucose spike than usual.';
    }
    if (stats.steps > 8000 && foodScore >= 7) {
      return 'Great activity today. This nutrient-dense meal supports recovery and replenishes energy efficiently.';
    }
  }

  // Score-based fallbacks (used when no vitals data or no specific vitals trigger)
  if (foodScore >= 7.5) {
    return 'This is a strong nutritional choice. It supports cellular repair, metabolic balance, and sustained energy across key body systems.';
  }
  if (foodScore >= 5) {
    return 'Moderate nutritional profile. This meal provides some benefits but may place mild stress on metabolic or inflammatory pathways.';
  }
  if (foodScore >= 3) {
    return 'This meal has a low vitality score. It may strain metabolic and inflammatory pathways — consider pairing with fibre, protein, or antioxidant-rich foods.';
  }
  return 'High concern — this item scores poorly across multiple systems. Frequent consumption may negatively impact metabolic, cardiovascular, or hepatic health.';
};
