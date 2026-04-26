import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { getFoodLogs, FoodLog } from './history';

const CACHE_KEY = 'profile_header_cache_v1';

export interface ProfileHeaderSnapshot {
  userName: string;
  userEmail: string;
  scanCount: number;
  avgVitality: string;
  streak: number;
}

/** Local calendar day key (user's timezone) for streak matching. */
function dayKey(d: Date): string {
  return d.toDateString();
}

/**
 * Consecutive days with ≥1 scan, walking backward from the most recent "active" day:
 * - If you scanned today, the chain starts today.
 * - If not today but you scanned yesterday, the chain starts yesterday (common: no scan yet today).
 * - If neither today nor yesterday has a scan, current streak is 0 (chain is broken).
 */
export function computeCurrentStreakFromDaySet(days: Set<string>): number {
  const today = new Date();
  const hasToday = days.has(dayKey(today));
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const hasYesterday = days.has(dayKey(yest));

  if (!hasToday && !hasYesterday) return 0;

  const startI = hasToday ? 0 : 1;
  let streak = 0;
  for (let i = startI; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.has(dayKey(d))) streak++;
    else break;
  }
  return streak;
}

export function computeStatsFromLogs(logs: FoodLog[]): Pick<ProfileHeaderSnapshot, 'scanCount' | 'avgVitality' | 'streak'> {
  const scanCount = logs.length;
  if (logs.length === 0) {
    return { scanCount: 0, avgVitality: '—', streak: 0 };
  }
  const validScores = logs.filter((l) => l.vitality_score > 0).map((l) => l.vitality_score);
  const avgVitality =
    validScores.length > 0
      ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1)
      : '—';
  const days = new Set(
    logs.map((l) => {
      const t = l.created_at ? new Date(l.created_at) : new Date(0);
      return dayKey(t);
    })
  );
  const streak = computeCurrentStreakFromDaySet(days);
  return { scanCount, avgVitality, streak };
}

export async function readProfileHeaderCache(): Promise<ProfileHeaderSnapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ProfileHeaderSnapshot>;
    if (
      typeof p.userName !== 'string' ||
      typeof p.userEmail !== 'string' ||
      typeof p.scanCount !== 'number' ||
      typeof p.avgVitality !== 'string' ||
      typeof p.streak !== 'number'
    ) {
      return null;
    }
    return {
      userName: p.userName,
      userEmail: p.userEmail,
      scanCount: p.scanCount,
      avgVitality: p.avgVitality,
      streak: p.streak,
    };
  } catch {
    return null;
  }
}

export async function writeProfileHeaderCache(snapshot: ProfileHeaderSnapshot): Promise<void> {
  try {
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error('writeProfileHeaderCache', e);
  }
}

export async function clearProfileHeaderCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Refresh header cache from Supabase (call on app load when session is active). */
export async function warmProfileHeaderCache(): Promise<void> {
  try {
    const [{ data: { user } }, logs] = await Promise.all([supabase.auth.getUser(), getFoodLogs()]);
    if (!user) return;
    const userName = (user.user_metadata?.full_name || user.user_metadata?.name || '') as string;
    const userEmail = user.email || '';
    const stats = computeStatsFromLogs(logs);
    await writeProfileHeaderCache({ userName, userEmail, ...stats });
  } catch (e) {
    console.error('warmProfileHeaderCache', e);
  }
}
