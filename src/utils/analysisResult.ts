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
  /** Be slightly lenient: we need at least some organs and some pillars to show a UI. */
  if (!Array.isArray(organs) || organs.length < 1) return false;
  if (!Array.isArray(pillars) || pillars.length < 3) return false;

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

export function getAnalysisFailureMessage(result: unknown): string {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.analysisError === 'string' && r.analysisError.length > 0) {
      return r.analysisError;
    }
    if (typeof r.error === 'string' && r.error.length > 0) {
      return r.error;
    }
  }
  return ANALYSIS_FAILURE_USER_MESSAGE;
}
