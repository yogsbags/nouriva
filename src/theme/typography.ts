// ─── Nouriva AI Typography ───────────────────────────────────────────────────
// Typeface: Inter (Google Fonts / expo-google-fonts)
// Loaded in App.tsx via useFonts — all components reference these constants.

export const Font = {
  /** 400 – body copy, descriptions */
  Regular: 'Inter_400Regular',
  /** 500 – labels, secondary emphasis */
  Medium: 'Inter_500Medium',
  /** 600 – card titles, navigation labels */
  SemiBold: 'Inter_600SemiBold',
  /** 700 – section headings, pill text */
  Bold: 'Inter_700Bold',
  /** 800 – hero metrics, score numbers */
  ExtraBold: 'Inter_800ExtraBold',
  /** 900 – age display, giant stat */
  Black: 'Inter_900Black',
} as const;

/** Consistent type scale — use these sizes across screens */
export const TypeScale = {
  /** Giant hero stat (36–40px) */
  hero: 38,
  /** Section heading (22–24px) */
  h1: 22,
  /** Card title / sub-heading (17–18px) */
  h2: 17,
  /** Body / description (14px) */
  body: 14,
  /** Label / pill caption (12px) */
  label: 12,
  /** Small / footnote (11px) */
  caption: 11,
  /** Micro / uppercase tag (10px) */
  micro: 10,
} as const;
