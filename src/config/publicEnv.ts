/** At release build time, EAS inlines `EXPO_PUBLIC_*` from Environment variables in expo.dev. */
export function isSupabaseEnvConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  return url.length > 0 && key.length > 0;
}
