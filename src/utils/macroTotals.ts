/** Minimal shape for macro summing (avoids importing `history` at runtime). */
type LogWithMacros = {
  macros?: { calories?: string; protein?: string; fats?: string; carbs?: string };
};

/**
 * Sum logged macros for one or more meals (same parsing as History “selected day”).
 * Standalone module so Metro never sees `sumMacroTotalsFromLogs` as undefined from a circular `history` graph.
 */
export function sumMacroTotalsFromLogs(logs: LogWithMacros[]): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  return logs.reduce(
    (acc, l) => ({
      calories: acc.calories + parseInt(l.macros?.calories?.replace(/[^0-9]/g, '') || '0', 10),
      protein: acc.protein + parseInt(l.macros?.protein?.replace(/[^0-9]/g, '') || '0', 10),
      carbs: acc.carbs + parseInt(l.macros?.carbs?.replace(/[^0-9]/g, '') || '0', 10),
      fats: acc.fats + parseInt(l.macros?.fats?.replace(/[^0-9]/g, '') || '0', 10),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );
}
