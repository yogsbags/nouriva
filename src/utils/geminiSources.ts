/**
 * geminiSources.ts
 * Fires a separate lightweight Gemini call with Google Search Grounding enabled
 * to retrieve real, verifiable citation URLs for the Sources section.
 *
 * WHY SEPARATE: Gemini's grounding tool is incompatible with
 *   `generationConfig.response_mime_type: "application/json"`.
 *   The main analysis call requires JSON mode, so grounding must run in a
 *   distinct call. It fires in parallel (text path) or immediately after
 *   (image path) to minimise added latency.
 */

import { getGeminiApiKeys } from './geminiApiKeys';

export interface GroundedSource {
  title: string;
  url: string;
  desc: string;
}

const GROUNDING_TIMEOUT_MS = 15_000;

/**
 * Fetch real, grounded citations from Gemini Search Grounding.
 *
 * @param foodName    - e.g. "Grilled Chicken & Quinoa Bowl"
 * @param alertKeywords - alert types from the main analysis, used to focus the search
 *                        (e.g. ["Glycaemic Spike", "Renal Load"])
 * @returns Array of up to 5 { title, url, desc } objects from live web sources.
 *          Returns [] on any failure so it never blocks the main result.
 */
export async function fetchGroundedSources(
  foodName: string,
  alertKeywords: string[] = [],
): Promise<GroundedSource[]> {
  const keys = getGeminiApiKeys();
  if (!keys.length) return [];

  // Use the same flash model as main analysis
  const model = (process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL ?? '').trim() || 'gemini-3-flash-preview';
  const key = keys[0]!;
  const url = `https://generativelanguage.googleapis.com/v1alpha/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  // Focus the search query on the food + alert areas to get relevant citations
  const focusTopics = alertKeywords.length > 0
    ? alertKeywords
        .map((a) => a.replace(/^⚠️\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ')
    : 'nutritional benefits and risks';

  const searchQuery = `Nutritional science and clinical research on: ${foodName}. Topics: ${focusTopics}. Cite PubMed, NIH, Harvard Health, or authoritative nutrition sources.`;

  const payload = {
    contents: [{
      parts: [{
        text: searchQuery,
      }],
    }],
    tools: [{ google_search_retrieval: {} }],
    generationConfig: { temperature: 0.1 },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROUNDING_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[GeminiSources] Non-OK response:', response.status);
      return [];
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // Extract grounding chunks — each has web.uri and web.title
    const groundingChunks: any[] =
      (data as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    // Extract the text content to derive per-source descriptions
    const contentText: string =
      (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Split content into meaningful sentences for descriptions
    const sentences = contentText
      .split(/(?<=[.!?])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 30);

    const sources: GroundedSource[] = groundingChunks
      .filter((chunk) => chunk?.web?.uri && chunk?.web?.title)
      .map((chunk, i) => {
        const rawTitle: string = chunk.web.title as string;
        const rawUrl: string = chunk.web.uri as string;
        // Use a matching sentence as description, or fall back to empty string
        const desc = sentences[i] != null
          ? sentences[i].slice(0, 150) + (sentences[i].length > 150 ? '…' : '')
          : '';
        return { title: rawTitle, url: rawUrl, desc };
      })
      .slice(0, 5); // Cap at 5 sources

    console.log(
      `[GeminiSources] ${sources.length} grounded sources retrieved for "${foodName}"`,
    );
    return sources;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn('[GeminiSources] Timed out after 15s — skipping grounded sources.');
    } else {
      console.warn('[GeminiSources] Failed:', e?.message ?? String(e));
    }
    return [];
  }
}
