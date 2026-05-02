import { getCachedFoodTextAnalysis, setCachedFoodTextAnalysis } from './analysisCache';
import { isAnalysisResultActionable } from './analysisResult';
import { getGeminiApiKeys, isRetryableQuotaOrRateLimit } from './geminiApiKeys';

const TEXT_ANALYSIS_PROMPT_VERSION = 'meal-text-analysis-v3';

/** Override with EXPO_PUBLIC_GEMINI_FLASH_MODEL (e.g. gemini-2.0-flash). */
const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

const GEMINI_FLASH_MODEL_ID =
  (process.env.EXPO_PUBLIC_GEMINI_FLASH_MODEL ?? '').trim() || DEFAULT_GEMINI_FLASH_MODEL;

const GEMINI_FLASH_GENERATE_URL = `https://generativelanguage.googleapis.com/v1alpha/models/${encodeURIComponent(
  GEMINI_FLASH_MODEL_ID
)}:generateContent`;

function geminiUrlWithKey(apiKey: string): string {
  return `${GEMINI_FLASH_GENERATE_URL}?key=${encodeURIComponent(apiKey)}`;
}

/** Fixed “System Pillar” rows: pillar name + which organ/system the `organ` field must draw from (one primary per row). */
const SYSTEMIC_PILLARS_JSON_SPEC = `
SYSTEM PILLARS (required): "systemicData" MUST be an array of EXACTLY 6 objects, in this order, with these exact "pillar" strings (do not rename, do not add/remove rows):
1. { "pillar": "Metabolic", "organ": "Pancreas/Liver", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Pancreas/Liver
2. { "pillar": "Cognitive", "organ": "Brain/Nervous System", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Brain/Nervous System
3. { "pillar": "Structural", "organ": "Bones/Skin/Joints", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Bones/Skin/Joints
4. { "pillar": "Digestive", "organ": "Gut Microbiome", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Gut Microbiome
5. { "pillar": "Cardiovascular", "organ": "Heart/Vessels", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Heart/Vessels
6. { "pillar": "Immunological", "organ": "Immune System/Spleen", "score": "X.X/10", "title": "...", "desc": "..." } — scope: Immune system
`;

/** Longevity pathway spec injected into both image and text prompts */
const LONGEVITY_SPEC = `
LONGEVITY ANALYSIS (required): Return a "longevityData" object assessing how this meal affects the molecular machinery of aging.
- longevityScore: number from -10 (accelerates aging) to +10 (strongly anti-aging). 0 = neutral. Base on the net effect of all compounds.
- dietaryAgeDelta: estimated years added (+) or removed (-) from biological age per meal. Typical range: -1.5 to +1.5. Be conservative.
- nadPathway: one of "boost" | "neutral" | "deplete" — does this meal supply NAD+ precursors (niacin, NMN precursors in edamame/avocado/mushrooms)?
- sirtuinActivators: array of specific compounds found (e.g. "resveratrol", "quercetin", "fisetin", "curcumin", "EGCG"). Empty array if none.
- mTorStatus: one of "suppressed" | "neutral" | "activated" — high animal protein activates mTOR (pro-aging); caloric restriction/plant protein suppresses it.
- autophagyInduction: one of "strong" | "mild" | "neutral" | "inhibited" — spermidine (wheat germ, mushrooms, soy), polyphenols, and low sugar induce autophagy.
- inflammationIndex: 0.0–10.0 score. Higher = more inflammatory. Processed foods, refined carbs, omega-6 overload raise it. Turmeric, omega-3, polyphenols lower it.
- telomereImpact: one of "protective" | "neutral" | "damaging" — omega-3s, antioxidants are protective; excess sugar, processed meat are damaging.
- keyCompounds: array of up to 4 objects { "name": "compound name", "pathway": "which longevity pathway", "source": "which food in the meal" }
- longevitySummary: one plain-English sentence summarising the net longevity impact of this meal. Max 25 words.
`;

const INCOMPLETE_MSG =
  'Analysis came back incomplete. Try again with better light, a steady hand, and food clearly in frame.';

/** Shared style: plain-English first, optional precise terms for informed readers (no jargon fences). */
const MEAL_ANALYSIS_VOICE = `
VOICE & AUDIENCE (required):
- Write for BOTH a curious layperson and someone with training in nutrition or biology.
- Use clear, everyday language first; add a short technical phrase in parentheses only where it helps (e.g. "steady blood sugar after eating (lower glycemic impact)").
- Avoid unexplained abbreviations; if you use one, spell it out once nearby.
- Avoid both dry textbook dumps and oversimplified baby talk. Sound like a careful guide explaining at a check-in.
`;

const MEAL_ANALYSIS_FIELD_RULES = `
FIELD RULES:
- Keep "title" (systemic rows) to a short headline anyone can scan (~2-3 words); no unexplained insider jargon.
- Keep "desc" and each organ "driver" to ~35 words max. One or two sentences: state the plain takeaway first, then (optionally) a brief mechanism path for advanced readers.
- Biochemicals "summary": one line that anyone can follow; "pathway"/"targets" may use precise terms since those fields are for depth.
- Alerts "desc": state the practical concern first (under ~22 words), optional brief mechanism.
- Scores: one decimal place (e.g. 7.5/10).
- balancerSuggestions: each "suggestion" must be uniquely tailored to the SCANNED MEAL and the specific organ's vulnerability from it. It must name a concrete food or compound to ADD TO THIS MEAL (or take alongside it) to offset its specific downsides. Minimum ~40 words: open with the addition + amount, then timing, then the specific physiological pathway it targets for that organ. Each suggestion must target a DIFFERENT biochemical theme — do not repeat the same advice (e.g. "add fiber", "drink water") across multiple organs.
- Plain, confident wording in suggestions and descriptions: prefer everyday phrasing ("add fibre-rich vegetables", "a 10-minute walk after eating") over stiff lab phrasing ("co-ingestion", "biochemical stabilizers") unless you briefly define a term for advanced readers.
`;

const MEAL_ANALYSIS_PERSONALIZATION = `
PERSONALIZATION RULES (STRICT):
- Use the "USER_BIOMETRIC_PROFILE" (if provided) as the absolute primary filter for all scores.
- Treat selected conditions, free-text profile notes, and uploaded-report markers as equally valid user context. Do not ignore free-text notes because they are not from a predefined catalog.
- Infer clinically relevant nutrition implications from the user's context using general nutrition and physiology knowledge: nutrient needs, absorption blockers/enhancers, medication or lab-marker considerations, likely symptom triggers, and organ/system vulnerabilities.
- A food that is "healthy" for a standard baseline may be neutral or risky for a specific profile; adjust scores whenever the scanned food has a meaningful interaction with the user's context.
- If the user context changes whether this food is suitable, reflect that in Metabolic/Systemic scores, Organ scores, alerts, and balancerSuggestions. If the food is broadly beneficial but has a profile-specific limitation, keep a balanced score and explicitly explain the limitation.
- PERSONALIZED OUTPUT VISIBILITY: When USER_BIOMETRIC_PROFILE is provided from selected conditions or free-text profile notes, at least 4 of the 6 "systemicData" descriptions and at least 3 "organData" drivers must visibly connect the meal to that profile context. Use natural phrasing such as "for your noted ...", "given your profile note about ...", or "with this condition in mind" when appropriate. Do not make the output feel like a generic healthy-adult analysis.
- If USER_BIOMETRIC_PROFILE is NOT provided, keep the output generic for a standard healthy adult and do not pretend to personalize.
- TAILOR ADVICE: Ensure "balancerSuggestions" and "alerts" directly reference the relevant user context in plain language when profile context is provided, without overdiagnosing or inventing conditions not supplied by the user.
- If the meal has no meaningful interaction with the user's context, say that briefly in the relevant descriptions rather than forcing a warning.
- Examples are illustrative, not exhaustive:
  - If the user context implies impaired nutrient absorption or higher micronutrient needs, evaluate whether this food improves, blocks, or requires pairing for relevant nutrients.
  - If the user context implies glucose sensitivity or metabolic stress, adjust glycemic scoring using carbohydrates, fiber, fats, protein, and portion size.
  - If the user context implies high activity, recovery needs, or pregnancy/lactation, consider calories, protein quality, electrolytes, hydration, and micronutrient density.
  - If the user context implies cardiovascular, kidney, digestive, inflammatory, immune, or neurological vulnerability, evaluate the relevant food factors such as sodium, potassium, saturated fat, fiber, acidity, allergens, histamine-like triggers, antioxidants, and hydration load.
`;

const MEAL_ANALYSIS_CORE_STEPS = `
1. ITEMIZE: Identify every distinct food and likely hidden ingredients.
2. INTERACTIONS: Note how items combine (e.g. fat with vegetables, salt with starch, acids with iron absorption).
3. WHOLE-MEAL IMPACT: Score all six System Pillars (Metabolic, Cognitive, Structural, Digestive, Cardiovascular, Immunological) out of 10 for the meal as a whole — one score per pillar.
`;

export async function analyzeFoodImage(images: string[], medicalConditions: string[] = []): Promise<any> {
  const keys = getGeminiApiKeys();
  if (!keys.length) {
    throw new Error('Gemini API key is not configured.');
  }

  const profileContext = medicalConditions.some(c => c && c.trim().length > 0)
    ? `USER_BIOMETRIC_PROFILE: ${medicalConditions.join('. ')}`
    : 'INSTRUCTION: Standard healthy adult baseline.';

  console.log(`--- MEAL ANALYSIS (${images.length} frames) ---`);
  const _t0 = Date.now();

  const imageParts = images.map(img => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: img,
    },
    media_resolution: { level: "media_resolution_high" }
  }));

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are an expert registered dietitian and metabolism-focused analyst. Analyze this plate/meal as one whole meal.
${profileContext}
${MEAL_ANALYSIS_CORE_STEPS}
${MEAL_ANALYSIS_VOICE}
${MEAL_ANALYSIS_FIELD_RULES}
${MEAL_ANALYSIS_PERSONALIZATION}
${SYSTEMIC_PILLARS_JSON_SPEC}
${LONGEVITY_SPEC}
- NEVER generic balancer lines: each must name a specific food or compound with amount, timing, and a distinct mechanism/pathway.

Return JSON:
{
  "foodName": "Collective Name (e.g. Grilled Chicken & Superfood Salad)",
  "macros": { "calories": "X kcal", "protein": "Xg", "fats": "Xg", "carbs": "Xg", "servingBasis": "Full Plate Analysis", "containerPrecisionFactor": 1.0 },
  "systemicData": [
    { "pillar": "Metabolic", "organ": "Pancreas/Liver", "score": "X.X/10", "title": "Pillar Title", "desc": "Cumulative impact reasoning." },
    { "pillar": "Cognitive", "organ": "Brain", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Structural", "organ": "Bones/Skin/Joints", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Digestive", "organ": "Gut Microbiome", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Cardiovascular", "organ": "Heart/Vessels", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Immunological", "organ": "Immune System", "score": "X.X/10", "title": "...", "desc": "..." }
  ],
  "organData": [ { "organ": "Brain", "score": "X.X/10", "driver": "Why?" }, { "organ": "Liver", "score": "X.X/10", "driver": "..." }, { "organ": "Heart", "score": "X.X/10", "driver": "..." }, { "organ": "Gut", "score": "X.X/10", "driver": "..." }, { "organ": "Kidney", "score": "X.X/10", "driver": "..." }, { "organ": "Pancreas", "score": "X.X/10", "driver": "..." }, { "organ": "Skin", "score": "X.X/10", "driver": "..." } ],
  "biochemicals": [ { "name": "...", "type": "...", "effect": "Synergistic effect...", "pathway": "...", "targets": "E.g. SIRT1", "inhibitors": "E.g. High heat", "summary": "One-liner summary of what it is/does." } ],
  "alerts": [ { "type": "⚠️ Specific Category (e.g. ⚠️ Glycaemic Spike, ⚠️ Cardiovascular Risk, ⚠️ Digestive Stress, ⚠️ Renal Load, ⚠️ Inflammatory Trigger, ⚠️ Hepatic Strain, ⚠️ Sodium Overload, ⚠️ Neurological Impact, ⚠️ Immune Load)", "desc": "Concise reason under 20 words." } ],
  "balancerSuggestions": [
    {
      "organ": "Organ matching organData exactly",
      "suggestion": "Specific addition to THIS MEAL to protect this organ. Use concrete food/compound + dose + timing + physiological pathway. Must be unique vs other suggestions. ~40-60 words."
    }
  ],
  "glucoseData": { "gi": 55, "gl": 12, "fiberG": 3.5, "profile": "moderate", "insulinDemand": "moderate" },
  "longevityData": {
    "longevityScore": 3.5,
    "dietaryAgeDelta": -0.3,
    "nadPathway": "boost",
    "sirtuinActivators": ["resveratrol"],
    "mTorStatus": "neutral",
    "autophagyInduction": "mild",
    "inflammationIndex": 4.0,
    "telomereImpact": "neutral",
    "keyCompounds": [{ "name": "Resveratrol", "pathway": "SIRT1 activation", "source": "grape skin" }],
    "longevitySummary": "One plain-English sentence on net aging impact, max 25 words."
  },
  "refs": [ { "title": "Source", "desc": "Fact", "url": "URL" } ],
  "vision": [ { "label": "Detected Component", "box_2d": [100, 100, 900, 900] } ]
}`
          },
          ...imageParts
        ]
      }
    ],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.1
    }
  };

  let data: Record<string, unknown> = {};

  keyAttempt: for (let ki = 0; ki < keys.length; ki++) {
    const url = geminiUrlWithKey(keys[ki]!);
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s for image analysis

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (e: any) {
      console.log(`Latency: ${Date.now() - _t0}ms`);
      return {
        analysisIncomplete: true,
        analysisError: e?.name === 'AbortError'
          ? 'Analysis timed out. Try a smaller or clearer photo.'
          : (e?.message ? `Network error: ${e.message}` : 'Could not reach the analysis service. Check your connection.'),
      };
    }

    console.log(`Latency: ${Date.now() - _t0}ms`);
    data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      if (isRetryableQuotaOrRateLimit(response.status, data) && ki < keys.length - 1) {
        console.warn('[Gemini] Meal image analysis rate limited; retrying with fallback API key.');
        continue keyAttempt;
      }
      const msg =
        (data as any)?.error?.message ||
        (data as any)?.error?.status ||
        `Analysis request failed (${response.status})`;
      return { analysisIncomplete: true, analysisError: String(msg) };
    }
    break keyAttempt;
  }

  const contentText = (data as any).candidates?.[0]?.content?.parts?.[0]?.text;

  if (!contentText) {
    const blockReason =
      (data as any).promptFeedback?.blockReason || (data as any).candidates?.[0]?.finishReason;
    if (blockReason) {
      console.warn('[Gemini] empty or blocked content (reason in logs only; not shown to user)', blockReason);
    } else {
      console.error('Gemini: empty content', data);
    }
    return { analysisIncomplete: true, analysisError: INCOMPLETE_MSG };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(contentText) as Record<string, unknown>;
  } catch {
    return {
      analysisIncomplete: true,
      analysisError: 'Could not read the analysis. Try a clearer photo.',
      rawText: contentText,
    };
  }

  if (!isAnalysisResultActionable(parsed)) {
    return {
      ...parsed,
      analysisIncomplete: true,
      analysisError: typeof parsed.analysisError === 'string' && parsed.analysisError ? parsed.analysisError : INCOMPLETE_MSG,
    };
  }

  return parsed;
}

export async function analyzeFoodText(text: string, medicalConditions: string[] = []): Promise<any> {
  const keys = getGeminiApiKeys();
  if (!keys.length) throw new Error('Gemini API key is not configured.');

  const cached = await getCachedFoodTextAnalysis(text, medicalConditions, TEXT_ANALYSIS_PROMPT_VERSION);
  if (cached) {
    console.log(`--- TEXT MEAL ANALYSIS CACHE HIT: ${text} ---`);
    return cached;
  }

  const profileContext = medicalConditions.some(c => c && c.trim().length > 0)
    ? `USER_BIOMETRIC_PROFILE: ${medicalConditions.join('. ')}`
    : 'INSTRUCTION: Standard healthy adult baseline.';

  console.log(`--- TEXT MEAL ANALYSIS START: ${text} ---`);

  const payload = {
    contents: [{
      parts: [{
        text: `You are an expert registered dietitian and metabolism-focused analyst. Analyze this meal description: "${text}"
${profileContext}
${MEAL_ANALYSIS_CORE_STEPS}
${MEAL_ANALYSIS_VOICE}
${MEAL_ANALYSIS_FIELD_RULES}
${MEAL_ANALYSIS_PERSONALIZATION}
${SYSTEMIC_PILLARS_JSON_SPEC}
${LONGEVITY_SPEC}
- NEVER generic balancer lines: each must name a specific food or compound with amount, timing, and a distinct mechanism/pathway.

Return JSON:
{
  "foodName": "Collective Name (e.g. Grilled Chicken & Superfood Salad)",
  "macros": { "calories": "X kcal", "protein": "Xg", "fats": "Xg", "carbs": "Xg", "servingBasis": "Text-based Analysis", "containerPrecisionFactor": 1.0 },
  "systemicData": [
    { "pillar": "Metabolic", "organ": "Pancreas", "score": "X.X/10", "title": "Pillar Title", "desc": "Cumulative impact reasoning." },
    { "pillar": "Cognitive", "organ": "Brain", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Structural", "organ": "Bones", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Digestive", "organ": "Gut", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Cardiovascular", "organ": "Heart", "score": "X.X/10", "title": "...", "desc": "..." },
    { "pillar": "Immunological", "organ": "Immune System", "score": "X.X/10", "title": "...", "desc": "..." }
  ],
  "organData": [ { "organ": "Brain", "score": "X.X/10", "driver": "Why?" }, { "organ": "Liver", "score": "X.X/10", "driver": "..." }, { "organ": "Heart", "score": "X.X/10", "driver": "..." }, { "organ": "Gut", "score": "X.X/10", "driver": "..." }, { "organ": "Kidney", "score": "X.X/10", "driver": "..." }, { "organ": "Pancreas", "score": "X.X/10", "driver": "..." }, { "organ": "Skin", "score": "X.X/10", "driver": "..." } ],
  "biochemicals": [ { "name": "...", "type": "...", "effect": "Synergistic effect...", "pathway": "...", "targets": "E.g. SIRT1", "inhibitors": "E.g. High heat", "summary": "One-liner summary of what it is/does." } ],
  "alerts": [ { "type": "⚠️ Specific Category", "desc": "Concise reason under 20 words." } ],
  "balancerSuggestions": [
    {
      "organ": "Organ matching organData exactly",
      "suggestion": "Specific addition to THIS MEAL to protect this organ. Use concrete food/compound + dose + timing + physiological pathway. Must be unique vs other suggestions. ~40-60 words."
    }
  ],
  "glucoseData": { "gi": 55, "gl": 12, "fiberG": 3.5, "profile": "moderate", "insulinDemand": "moderate" },
  "longevityData": {
    "longevityScore": 3.5,
    "dietaryAgeDelta": -0.3,
    "nadPathway": "boost",
    "sirtuinActivators": ["resveratrol"],
    "mTorStatus": "neutral",
    "autophagyInduction": "mild",
    "inflammationIndex": 4.0,
    "telomereImpact": "neutral",
    "keyCompounds": [{ "name": "Resveratrol", "pathway": "SIRT1 activation", "source": "grape skin" }],
    "longevitySummary": "One plain-English sentence on net aging impact, max 25 words."
  },
  "refs": [ { "title": "Source", "desc": "Fact", "url": "URL" } ]
}`
      }]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.1
    }
  };

  let data: Record<string, unknown> = {};

  keyAttempt: for (let ki = 0; ki < keys.length; ki++) {
    const url = geminiUrlWithKey(keys[ki]!);
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (e: any) {
      return {
        analysisIncomplete: true,
        analysisError: e?.name === 'AbortError'
          ? 'Analysis timed out. Please check your connection and try again.'
          : (e?.message ? `Network error: ${e.message}` : 'Could not reach the analysis service.'),
      };
    }

    data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      if (isRetryableQuotaOrRateLimit(response.status, data) && ki < keys.length - 1) {
        console.warn('[Gemini] Text meal analysis rate limited; retrying with fallback API key.');
        continue keyAttempt;
      }
      const msg = (data as any)?.error?.message || `Analysis request failed (${response.status})`;
      return { analysisIncomplete: true, analysisError: String(msg) };
    }
    break keyAttempt;
  }

  const contentText = (data as any).candidates?.[0]?.content?.parts?.[0]?.text;

  if (!contentText) {
    console.error('Gemini Error: No content returned', data);
    return { analysisIncomplete: true, analysisError: 'No response from AI. Try again.' };
  }

  try {
    const parsed = JSON.parse(contentText) as Record<string, unknown>;
    if (!parsed.foodName) parsed.foodName = text.split(' of ')[1] || text || 'Manual Meal';
    if (!isAnalysisResultActionable(parsed)) {
      return {
        ...parsed,
        analysisIncomplete: true,
        analysisError: INCOMPLETE_MSG,
      };
    }
    await setCachedFoodTextAnalysis(text, medicalConditions, TEXT_ANALYSIS_PROMPT_VERSION, parsed);
    console.log(`--- ANALYSIS COMPLETE: ${parsed.foodName} ---`);
    return parsed;
  } catch (e) {
    console.error('JSON Parse Error:', contentText);
    return { analysisIncomplete: true, analysisError: 'Failed to parse AI response. Try again.' };
  }
}
