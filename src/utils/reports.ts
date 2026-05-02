import * as FileSystem from 'expo-file-system';
import { getGeminiApiKeys, isRetryableQuotaOrRateLimit } from './geminiApiKeys';

/** Override with EXPO_PUBLIC_GEMINI_PRO_MODEL. */
const DEFAULT_GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';

const GEMINI_PRO_MODEL_ID =
  (process.env.EXPO_PUBLIC_GEMINI_PRO_MODEL ?? '').trim() || DEFAULT_GEMINI_PRO_MODEL;

const GEMINI_PRO_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
  GEMINI_PRO_MODEL_ID
)}:generateContent`;

function reportUrlWithKey(apiKey: string): string {
  return `${GEMINI_PRO_GENERATE_URL}?key=${encodeURIComponent(apiKey)}`;
}

export async function analyzeMedicalReport(uri: string): Promise<string> {
  const keys = getGeminiApiKeys();

  if (!keys.length) {
    throw new Error('Gemini API key is not configured.');
  }

  // Convert file to base64
  const base64Data = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are an advanced biochemical analyst. Analyze this medical lab report/scan to create a holistic "Biometric Snapshot" for personalized nutrition.
STRICT RULE: Do NOT provide medical diagnoses or disease names (e.g., do NOT say "You have Diabetes").
ANALYSIS: 
1. Summarize the user's overall metabolic and physiological baseline based on ALL markers (including normal ones).
2. Identify the user's "Metabolic Persona" (e.g., "Physiological state: Indicators of high athletic recovery demand", "Metabolic state: Pregnancy-adjusted baseline", "Systemic state: Signs of metabolic resistance").
3. List key markers that will impact nutritional priorities (e.g., insulin sensitivity markers, inflammatory markers, lipid profile, or vitamin deficiencies).
OUTPUT: A concise, technical summary of findings and the physiological profile. (e.g., "Snapshot: High protein requirement due to athletic markers; prioritize low-glycemic load due to early insulin resistance markers; pregnancy-adjusted mineral needs.").`
          },
          {
            inline_data: {
              mime_type: (uri || '').toLowerCase().endsWith('.pdf') ? "application/pdf" : "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for factual extraction
    }
  };

  for (let ki = 0; ki < keys.length; ki++) {
    const url = reportUrlWithKey(keys[ki]!);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (isRetryableQuotaOrRateLimit(response.status, data) && ki < keys.length - 1) {
          console.warn('[Gemini] Medical report analysis rate limited; retrying with fallback API key.');
          continue;
        }
        const msg = (data as any)?.error?.message || 'Failed to analyze report';
        throw new Error(msg);
      }

      return (data as any).candidates?.[0]?.content?.parts?.[0]?.text || "No insights extracted.";
    } catch (error) {
      console.error("Report Analysis Error:", error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error('Failed to analyze report');
}
