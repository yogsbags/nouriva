import * as FileSystem from 'expo-file-system';

export async function analyzeMedicalReport(uri: string): Promise<string> {
  const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  // Convert file to base64
  const base64Data = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to analyze report');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No insights extracted.";
  } catch (error) {
    console.error("Report Analysis Error:", error);
    throw error;
  }
}
