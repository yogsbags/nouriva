/** Primary + optional fallback (e.g. when primary hits quota / rate limits). */
export function getGeminiApiKeys(): string[] {
  const primary = (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '').trim();
  const fallback = (process.env.EXPO_PUBLIC_GEMINI2_API_KEY ?? '').trim();
  return [...new Set([primary, fallback].filter(Boolean))];
}

/** True when retrying with another API key may help (quota is per key). */
export function isRetryableQuotaOrRateLimit(status: number, body: unknown): boolean {
  if (status === 429) return true;
  const err = body && typeof body === 'object' ? (body as { error?: Record<string, unknown> }).error : undefined;
  const code = err?.code;
  const statusStr = String(err?.status ?? '').toUpperCase();
  const msg = String(err?.message ?? '').toLowerCase();
  if (code === 429) return true;
  if (statusStr === 'RESOURCE_EXHAUSTED') return true;
  if (msg.includes('resource exhausted')) return true;
  if (msg.includes('rate limit')) return true;
  if (msg.includes('too many requests')) return true;
  if (msg.includes('quota') && (msg.includes('exceed') || msg.includes('exceeded') || msg.includes('limit')))
    return true;
  return false;
}
