import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAnalysisResultActionable } from './analysisResult';

const CACHE_KEY_PREFIX = 'food_analysis_cache_v1';
const CACHE_INDEX_KEY = 'food_analysis_cache_index_v1';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;

type CachedAnalysisEntry = {
  expiresAt: number;
  savedAt: number;
  value: Record<string, unknown>;
};

function normalizeWhitespace(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeMedicalConditions(medicalConditions: string[]): string {
  return medicalConditions
    .map((condition) => normalizeWhitespace(condition))
    .filter(Boolean)
    .sort()
    .join('|');
}

function storageKey(text: string, medicalConditions: string[], promptVersion: string): string {
  const meal = normalizeWhitespace(text);
  const profile = normalizeMedicalConditions(medicalConditions);
  return `${CACHE_KEY_PREFIX}:${promptVersion}:${meal}:${profile}`;
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(keys));
  } catch {
    /* ignore cache maintenance failures */
  }
}

async function trimCache(): Promise<void> {
  const keys = await readIndex();
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  const overflow = keys.length - MAX_CACHE_ENTRIES;
  const staleKeys = keys.slice(0, overflow);

  if (staleKeys.length > 0) {
    await AsyncStorage.multiRemove(staleKeys).catch(() => {});
    await writeIndex(keys.slice(overflow));
  }
}

export async function getCachedFoodTextAnalysis(
  text: string,
  medicalConditions: string[],
  promptVersion: string,
): Promise<Record<string, unknown> | null> {
  const key = storageKey(text, medicalConditions, promptVersion);

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedAnalysisEntry;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.expiresAt !== 'number' || !parsed.value) {
      await AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }

    if (Date.now() > parsed.expiresAt) {
      await AsyncStorage.multiRemove([key]).catch(() => {});
      const keys = await readIndex();
      if (keys.includes(key)) {
        await writeIndex(keys.filter(item => item !== key));
      }
      return null;
    }

    if (!isAnalysisResultActionable(parsed.value)) {
      await AsyncStorage.removeItem(key).catch(() => {});
      const keys = await readIndex();
      if (keys.includes(key)) {
        await writeIndex(keys.filter(item => item !== key));
      }
      return null;
    }

    return parsed.value;
  } catch {
    return null;
  }
}

export async function setCachedFoodTextAnalysis(
  text: string,
  medicalConditions: string[],
  promptVersion: string,
  value: Record<string, unknown>,
): Promise<void> {
  const key = storageKey(text, medicalConditions, promptVersion);
  const entry: CachedAnalysisEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    savedAt: Date.now(),
    value,
  };

  try {
    await AsyncStorage.setItem(key, JSON.stringify(entry));
    const keys = await readIndex();
    const nextKeys = [...keys.filter(item => item !== key), key];
    await writeIndex(nextKeys);
    await trimCache();
  } catch {
    /* ignore cache write failures */
  }
}
