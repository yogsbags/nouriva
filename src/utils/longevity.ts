import { supabase } from './supabase';
import { LongevityData } from './history';

export interface DietaryAgeResult {
  /** User's actual age in years */
  actualAge: number;
  /** Computed dietary biological age */
  dietaryAge: number;
  /** Positive = aging faster, negative = aging slower */
  ageDelta: number;
  /** Average longevity score across recent scans (-10 to +10) */
  avgLongevityScore: number;
  /** Average inflammation index (0–10) */
  avgInflammationIndex: number;
  /** Top sirtuin-activating compounds found across recent scans */
  topSirtuinActivators: string[];
  /** Distribution of mTOR status across recent scans */
  mTorBreakdown: { suppressed: number; neutral: number; activated: number };
  /** Distribution of autophagy across recent scans */
  autophagyBreakdown: { strong: number; mild: number; neutral: number; inhibited: number };
  /** Number of scans used in calculation */
  scanCount: number;
  /** Qualitative rating */
  rating: 'excellent' | 'good' | 'fair' | 'needs_work';
  /** One-sentence summary */
  summary: string;
}

/**
 * Maps an average longevityScore (-10 to +10) to a years-of-age delta.
 * Score  +10 → -5 years (eating like a longevity researcher)
 * Score   0  →  0 years
 * Score -10  → +5 years (chronically inflammatory diet)
 */
function scoreToDietaryAgeDelta(avgScore: number): number {
  // Linear mapping: score range [-10, +10] → delta range [+5, -5]
  return -(avgScore / 10) * 5;
}

function getRating(avgScore: number): DietaryAgeResult['rating'] {
  if (avgScore >= 5) return 'excellent';
  if (avgScore >= 2) return 'good';
  if (avgScore >= -2) return 'fair';
  return 'needs_work';
}

function getSummary(rating: DietaryAgeResult['rating'], ageDelta: number): string {
  const abs = Math.abs(ageDelta).toFixed(1);
  switch (rating) {
    case 'excellent':
      return `Your diet is actively slowing aging — you eat ~${abs} years younger than your actual age.`;
    case 'good':
      return `Your food choices are supporting longevity, keeping your dietary age ~${abs} years lower.`;
    case 'fair':
      return `Your diet is broadly balanced but has room to reduce aging pressure on your cells.`;
    case 'needs_work':
      return `Your recent meals are adding ~${abs} years of biological age pressure — small swaps can reverse this.`;
  }
}

/**
 * Fetches the last `days` days of food logs and computes a dietary biological age
 * relative to the user's actual age.
 */
export async function computeDietaryAge(
  actualAge: number,
  days: number = 30,
): Promise<DietaryAgeResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('food_logs')
      .select('longevity_data, created_at')
      .eq('user_id', session.user.id)
      .gte('created_at', since.toISOString())
      .not('longevity_data', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const logs: LongevityData[] = data
      .map((r: any) => r.longevity_data)
      .filter(Boolean) as LongevityData[];

    if (logs.length === 0) return null;

    // --- Aggregate metrics ---
    const avgLongevityScore =
      logs.reduce((sum, l) => sum + (l.longevityScore ?? 0), 0) / logs.length;

    const avgInflammationIndex =
      logs.reduce((sum, l) => sum + (l.inflammationIndex ?? 5), 0) / logs.length;

    // Top sirtuin activators (deduplicated, sorted by frequency)
    const sirtuinCounts: Record<string, number> = {};
    for (const log of logs) {
      for (const activator of log.sirtuinActivators ?? []) {
        sirtuinCounts[activator] = (sirtuinCounts[activator] ?? 0) + 1;
      }
    }
    const topSirtuinActivators = Object.entries(sirtuinCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // mTOR breakdown
    const mTorBreakdown = { suppressed: 0, neutral: 0, activated: 0 };
    for (const log of logs) {
      const status = log.mTorStatus ?? 'neutral';
      mTorBreakdown[status] = (mTorBreakdown[status] ?? 0) + 1;
    }

    // Autophagy breakdown
    const autophagyBreakdown = { strong: 0, mild: 0, neutral: 0, inhibited: 0 };
    for (const log of logs) {
      const ind = log.autophagyInduction ?? 'neutral';
      autophagyBreakdown[ind] = (autophagyBreakdown[ind] ?? 0) + 1;
    }

    // --- Dietary age ---
    const ageDelta = scoreToDietaryAgeDelta(avgLongevityScore);
    const dietaryAge = Math.max(18, Math.round((actualAge + ageDelta) * 10) / 10);
    const rating = getRating(avgLongevityScore);
    const summary = getSummary(rating, ageDelta);

    return {
      actualAge,
      dietaryAge,
      ageDelta: Math.round(ageDelta * 10) / 10,
      avgLongevityScore: Math.round(avgLongevityScore * 10) / 10,
      avgInflammationIndex: Math.round(avgInflammationIndex * 10) / 10,
      topSirtuinActivators,
      mTorBreakdown,
      autophagyBreakdown,
      scanCount: logs.length,
      rating,
      summary,
    };
  } catch (err) {
    console.error('[longevity] computeDietaryAge error:', err);
    return null;
  }
}

/**
 * Returns a short label + colour for the rating, for use in UI badges.
 */
export function ratingMeta(rating: DietaryAgeResult['rating']): {
  label: string;
  emoji: string;
  color: string;
} {
  switch (rating) {
    case 'excellent': return { label: 'Excellent', emoji: '🌿', color: '#22c55e' };
    case 'good':      return { label: 'Good',      emoji: '✅', color: '#84cc16' };
    case 'fair':      return { label: 'Fair',       emoji: '⚡', color: '#f59e0b' };
    case 'needs_work':return { label: 'Needs Work', emoji: '🔥', color: '#ef4444' };
  }
}

export interface LongevityShareOptions {
  /** Link shown at the bottom of the card (store / web) */
  appUrl?: string;
}

/**
 * Formatted text for system share sheet — designed to read well as a social / message card.
 */
export function buildLongevityShareMessage(result: DietaryAgeResult, options?: LongevityShareOptions): string {
  const meta = ratingMeta(result.rating);
  const url = (options?.appUrl || 'https://nouriva.ai').trim() || 'https://nouriva.ai';

  const deltaLabel =
    result.ageDelta <= 0
      ? `${Math.abs(result.ageDelta).toFixed(1)} yrs younger vs chronological age`
      : `${Math.abs(result.ageDelta).toFixed(1)} yrs above chronological age`;

  const sirtuinLine =
    result.topSirtuinActivators.length > 0
      ? result.topSirtuinActivators.slice(0, 4).join(' · ')
      : 'More scans will surface your top sirtuin allies';

  const mTorPct =
    result.scanCount > 0
      ? Math.round((result.mTorBreakdown.suppressed / result.scanCount) * 100)
      : 0;

  const autophagyInduced = result.autophagyBreakdown.strong + result.autophagyBreakdown.mild;
  const autoPct =
    result.scanCount > 0 ? Math.round((autophagyInduced / result.scanCount) * 100) : 0;

  const scoreStr = `${result.avgLongevityScore > 0 ? '+' : ''}${result.avgLongevityScore}`;
  const scanWord = result.scanCount === 1 ? 'scan' : 'scans';

  return [
    '──────────────',
    '  NOURIVA · LONGEVITY',
    '──────────────',
    '',
    `Chronological age     ${result.actualAge}`,
    `Dietary age           ${result.dietaryAge}`,
    `Shift                 ${deltaLabel}`,
    `Rating                ${meta.emoji} ${meta.label}`,
    '',
    'Insight',
    result.summary,
    '',
    `30-day snapshot · ${result.scanCount} ${scanWord}`,
    `· Longevity score     ${scoreStr} / 10`,
    `· Inflammation        ${result.avgInflammationIndex.toFixed(1)} / 10`,
    `· Sirtuin allies      ${sirtuinLine}`,
    `· mTOR (favorable)    ${mTorPct}% of meals`,
    `· Autophagy (induced) ${autoPct}% of meals`,
    '',
    `Get Nouriva AI → ${url}`,
    '',
    '— Informational only, not medical advice.',
  ].join('\n');
}

/**
 * Returns the longevityData from a single scan result object (safe accessor).
 */
export function extractLongevityData(scanResult: any): LongevityData | undefined {
  if (!scanResult?.longevityData) return undefined;
  const d = scanResult.longevityData;
  // Basic validation
  if (typeof d.longevityScore !== 'number') return undefined;
  return d as LongevityData;
}
