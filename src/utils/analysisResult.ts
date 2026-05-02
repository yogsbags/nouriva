/**
 * True when the model returned enough structured data to show real results
 * (not placeholders or parse failures).
 */
export function isAnalysisResultActionable(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  if (r.rawText) return false;
  if (typeof r.error === 'string' && r.error.length > 0) return false;

  const organs = r.organData;
  const pillars = r.systemicData;
  if (!Array.isArray(organs) || organs.length < 2) return false;
  /** Expect six System Pillar rows (through Immunological) per llm.ts contract. */
  if (!Array.isArray(pillars) || pillars.length < 6) return false;

  return true;
}

/** Use when deciding to show the failure / Re-scan screen instead of scores. */
export function isAnalysisIncomplete(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const r = result as Record<string, unknown>;
  if (r.analysisIncomplete === true) return true;
  return !isAnalysisResultActionable(result);
}

/** Copy for any failed scan. Never surface raw API errors, block reasons, or model safety strings. */
export const ANALYSIS_FAILURE_USER_MESSAGE =
  'Tap Re-scan to try again with good light, a steady shot, and your meal filling the frame.';

export function getAnalysisFailureMessage(_result: unknown): string {
  return ANALYSIS_FAILURE_USER_MESSAGE;
}
