/**
 * geminiSources.ts
 * Fires PARALLEL separate Gemini calls with Google Search Grounding enabled
 * to retrieve real, verifiable citation URLs for the Citations & Sources section.
 *
 * WHY SEPARATE CALLS: Gemini's grounding tool is incompatible with
 *   `generationConfig.response_mime_type: "application/json"`.
 *   The main analysis call requires JSON mode, so grounding must run in
 *   distinct calls.
 *
 * WHY PARALLEL CALLS (one per topic): A single prompt with multiple numbered
 *   questions reliably triggers only 1–2 Google Searches regardless of question
 *   count. To get 4–6 distinct citations, each topic must be its own API call.
 *   Each call triggers its own independent Google Search → its own groundingChunk.
 *   Results are merged and deduplicated by URL.
 */

import { getGeminiApiKeys } from './geminiApiKeys';

export interface GroundedSource {
  title: string;
  url: string;
  desc: string;
}

const GROUNDING_TIMEOUT_MS = 18_000;
const MAX_SOURCES = 6;
const MAX_PARALLEL_CALLS = 6;

/** Attempt a single Gemini grounding call for one focused query. Returns up to 2 chunks. */
async function fetchSingleGroundedQuery(
  query: string,
  apiUrl: string,
  signal: AbortSignal,
): Promise<GroundedSource[]> {
  const payload = {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search_retrieval: {} }],
    generationConfig: { temperature: 0.1 },
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) return [];

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const groundingChunks: any[] =
      (data as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const contentText: string =
      (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Use the first meaningful sentence from the response as the description
    const desc = contentText
      .split(/[.\n]/)
      .map((s: string) => s.trim())
      .find((s: string) => s.length > 40) ?? '';

    return groundingChunks
      .filter((chunk) => chunk?.web?.uri && chunk?.web?.title)
      .map((chunk) => ({
        title: chunk.web.title as string,
        url: chunk.web.uri as string,
        desc: desc.length > 160 ? desc.slice(0, 157) + '…' : desc,
      }));
  } catch {
    return [];
  }
}

/**
 * Build the list of focused, single-topic queries to send in parallel.
 * Each becomes its own Gemini API call → its own Google Search → distinct citation.
 */
function buildTopicQueries(foodName: string, alertKeywords: string[]): string[] {
  const cleanAlerts = alertKeywords
    .map((a) => a.replace(/^⚠️\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  const queries: string[] = [
    `What are the key health benefits and nutritional value of ${foodName}? Cite a PubMed, NIH, or Harvard Health source.`,
    `What do clinical studies say about the glycaemic index and macronutrient profile of ${foodName}? Cite a peer-reviewed source.`,
    `What vitamins, minerals, or bioactive compounds in ${foodName} affect metabolic or cardiovascular health? Cite a scientific source.`,
    `What does research say about ${foodName} and inflammation or antioxidant effects? Cite PubMed or WHO.`,
  ];

  // Add alert-specific queries — each alert gets its own call
  cleanAlerts.forEach((alert) => {
    queries.push(
      `What does scientific literature say about "${alert}" in relation to ${foodName} consumption? Cite a peer-reviewed source.`,
    );
  });

  // Cap total parallel calls
  return queries.slice(0, MAX_PARALLEL_CALLS);
}

/**
 * Fetch real, grounded citations from Gemini Search Grounding.
 * Fires one API call per topic in parallel, then merges and deduplicates results.
 *
 * @param foodName      - e.g. "Grilled Chicken & Quinoa Bowl"
 * @param alertKeywords - alert type strings from the main analysis result
 *                        (e.g. ["⚠️ Glycaemic Spike", "⚠️ Renal Load"])
 * @returns Array of up to 6 { title, url, desc } objects from live web sources.
 *          Returns [] on any failure so it never blocks the main result.
 */
export async function fetchGroundedSources(
  foodName: string,
  alertKeywords: string[] = [],
): Promise<GroundedSource[]> {
  const keys = getGeminiApiKeys();
  if (!keys.length) return [];

  const model =
    (process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL ?? '').trim() || 'gemini-2.0-flash';
  const key = keys[0]!;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const queries = buildTopicQueries(foodName, alertKeywords);

  // Single shared AbortController so all calls are cancelled together on timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROUNDING_TIMEOUT_MS);

  try {
    // Fire all queries in parallel — each gets its own Google Search
    const results = await Promise.allSettled(
      queries.map((q) => fetchSingleGroundedQuery(q, apiUrl, controller.signal)),
    );
    clearTimeout(timeoutId);

    // Flatten all sources and deduplicate by URL
    const seen = new Set<string>();
    const merged: GroundedSource[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const src of result.value) {
        if (src.url && !seen.has(src.url)) {
          seen.add(src.url);
          merged.push(src);
          if (merged.length >= MAX_SOURCES) break;
        }
      }
      if (merged.length >= MAX_SOURCES) break;
    }

    console.log(
      `[GeminiSources] ${merged.length} unique grounded sources retrieved for "${foodName}" (${queries.length} parallel calls)`,
    );
    return merged;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      console.warn('[GeminiSources] Timed out — skipping grounded sources.');
    } else {
      console.warn('[GeminiSources] Failed:', e?.message ?? String(e));
    }
    return [];
  }
}
