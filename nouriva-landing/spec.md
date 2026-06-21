# Nouriva AI — Landing Page Spec

## Project Context

**Product:** Nouriva AI — clinical nutrition app that reads your lab work and medical conditions to personalise every meal recommendation.

**Brand story:** This is not "AI calorie counter #47." Every competitor scans food; only Nouriva treats your meal against *your body*. The brand voice is confident, warm, quietly authoritative. Editorial — like Aesop meets a medical journal.

**Page purpose:** Convert visitors to App Store / Play Store installs. Single-page, scrollable, no real nav beyond logo + a single CTA.

**Audience:** Health-aware adults (28–55), managing a condition or just curious about their nutrition. India-first, English-language. Mix of newly diagnosed (Type 2, PCOS, thyroid) and longevity optimizers.

## Hero Section

**Pattern:** Video-Led + Type-Led hybrid.
- Full-bleed muted autoplay video background (`./videos/hero_loop.mp4`, 1366×768, 5.875s loop).
- Massive editorial typography overlaid. Top-aligned, generous left padding.
- Headline (display serif, ~9vw on desktop): `Food that fits your lab work, not just your macros.`
- Subhead (sans, 1.4rem max-width 540px): "Nouriva AI reads your lab report, knows your medical conditions, and scores every meal for YOUR body — not a generic food database."
- Two CTAs side by side: App Store (primary green pill, white text, Apple logo inline) + Google Play (cream pill, charcoal text, Play logo inline).
- Tiny caption below: "3-day free trial · No commitment · ₹399/year after trial"
- Top-right tiny nav: "Science · Privacy · Support"
- Bottom-left small "Clinical Nutrition Intelligence" eyebrow text with a small dot.
- No static poster image — video autoplays muted and loops. Container background `#1F4A36` as fallback.

## Color System (Strict — no blue/purple)

| Token | Hex | Usage |
|---|---|---|
| `--green-900` | `#0F3D2E` | Deepest brand, footer, hero video fallback |
| `--green-800` | `#1F4A36` | Hero overlay, primary CTAs, headings |
| `--green-700` | `#2F6B4F` | Secondary surfaces, hover states |
| `--green-500` | `#6B8E7F` | Sage, dividers, subtle text |
| `--amber-500` | `#E8A341` | Accent only — CTAs on dark, vital highlights |
| `--amber-300` | `#F2C575` | Light amber, score rings, decorative |
| `--cream-50` | `#FAF7F0` | Page background |
| `--cream-100` | `#F0E9D8` | Cards, subtle sections |
| `--cream-200` | `#E5DCC4` | Borders, dividers |
| `--ink-900` | `#1A1F1B` | Body text |
| `--ink-700` | `#3D4540` | Secondary text |
| `--ink-500` | `#8B8579` | Tertiary text |
| `--alert-amber` | `#C97539` | Warning indicators (lab values) |
| `--success-green` | `#5A9B6E` | Positive deltas |

**Forbidden:** Any blue, indigo, violet, blurple, neon purple. The brand is greens + warm earth tones only.

## Typography

- **Display Serif:** `Fraunces` (Google Fonts, weights 400-700, opsz 144) — for headlines and the brand name.
- **Body Sans:** `Inter` (Google Fonts, weights 400-600) — for body, captions, UI.
- **Mono Numerals:** `JetBrains Mono` (Google Fonts, weight 500) — for the vitality score and metric numbers.

**Scale (desktop):**
- `clamp(2.5rem, 9vw, 8rem)` — hero headline
- `clamp(1.75rem, 4vw, 3.25rem)` — section headlines
- `clamp(1.25rem, 2vw, 1.625rem)` — sub-headlines
- `1rem` (16px) — body
- `0.875rem` — small body
- `0.75rem` — captions, eyebrow

## Layout System

- Max content width: `1280px`
- Section padding: `clamp(4rem, 10vh, 8rem) clamp(1.5rem, 5vw, 3rem)`
- Grid: 12-column CSS grid, 24px gutter (desktop), 16px (mobile)
- Mobile breakpoint: `768px`

## Page Structure

1. **Top nav** (sticky, transparent over hero, becomes cream after scroll)
   - Logo (Nouriva wordmark + leaf mark in green/amber)
   - Right links: Science · Privacy · Support · [Get the app button]

2. **Hero** (100vh, video bg)
   - Eyebrow: "Clinical Nutrition Intelligence"
   - Headline: "Food that fits your lab work, not just your macros."
   - Subhead paragraph
   - Two CTA pills (App Store, Google Play)
   - "3-day free trial" line

3. **Trust strip** (no section, inline band after hero)
   - 5 inline items: "Apple Health Integration · No data shared with third parties · Lab reports stay encrypted · Built for Indian kitchens · Peer-reviewed nutritional science"

4. **The Differentiator** (3-column, white background)
   - Section eyebrow: "Why Nouriva"
   - Headline: "Three things every other nutrition app skips."
   - 3 cards:
     - **Lab Report Integration** — "Upload your blood work. We extract out-of-range markers and factor them into every future meal score. Your HbA1c, cholesterol, vitamin D — all become personalisation input."
     - **Conditions-Aware Scoring** — "Add your diabetes, PCOS, thyroid, hypertension, vitamin deficiencies. Every food-vs-you verdict reflects them. No more 'health halo' lies."
     - **Organ-Level Insight** — "Beyond macros. See how each meal affects your heart, liver, kidneys, gut. Pattern-spot over weeks. That's nutrition science, not food shaming."

5. **Lab Report Demo** (split-screen, cream background)
   - Left: lab_report.png (the editorial reading-glasses-on-report shot)
   - Right: Mock UI card showing "3 markers detected" with HbA1c 7.2, Vitamin D 18 ng/mL, Total Cholesterol 245 mg/dL — with copy: "Drop in your lab PDF or photo. We surface out-of-range markers and tune every recommendation to them — automatically."

6. **How It Works** (3-step horizontal, white background)
   - Eyebrow: "In 30 seconds"
   - Steps:
     1. **Scan** — "Point your camera. AI identifies the meal in seconds."
     2. **Personalise** — "We score it against your lab work, conditions, and goals."
     3. **Act** — "Vitality score, organ impact, balancer pairings — eat smarter."

7. **Vitality Score Showcase** (deep green background, full-bleed)
   - Two-column: left text, right phone_mockup.png with floating UI
   - Headline: "One number. The whole story."
   - Body: "Vitality Score is a 0–100 weighted index — calibrated against your macros, micronutrients, organ load, inflammation markers, and lab baseline. No more calorie counting guesswork."
   - Stats: "87% of meals get a balancer suggestion. 4.2× more signal than calorie-only apps."

8. **Built for India First** (cream background)
   - Two-column: left thali_hero.png (square), right text
   - Headline: "Built for the food you actually eat."
   - Body: "We recognise dal makhani, samosa, chai, maggi, dosa, paratha — and the conditions most Indians actually manage: Type 2 diabetes, PCOS, thyroid, hypertension, vitamin D and B12 deficiency. Not a Western food database with two curry entries."

9. **Conditions Coverage** (white background, inline pill cloud)
   - Eyebrow: "Personalised for you"
   - Headline: "If you're managing it, Nouriva knows it."
   - Pill cloud: Diabetes · PCOS · Thyroid · Hypertension · Cholesterol · Vitamin D deficiency · Vitamin B12 deficiency · Insulin resistance · Fatty liver · Celiac · Lactose intolerance · IBS · GERD · Anemia · Kidney disease · plus 30+ more
   - Two CTAs at the end

10. **Privacy** (cream background, small section)
    - 3-column trust cards with icons:
      - **Bank-grade encryption** — "Your health data never leaves your device unencrypted."
      - **No third-party sharing** — "We don't sell or share. Verified on App Store data safety."
      - **You own your data** — "Export or delete at any time. One tap in Settings."

11. **Pricing** (white background, centered)
    - Eyebrow: "3-day free trial"
    - Headline: "Try everything. Pay if you stay."
    - Two pricing cards side by side:
      - **Monthly** — $9.99/mo, billed monthly, cancel anytime
      - **Yearly** — $49.99/yr, "Save 58%", 3-day free trial
    - Both: "Unlimited scans · Lab report parsing · Organ analysis · Apple Health · Priority processing"

12. **FAQ** (cream background, accordion)
    - 6 questions, expandable.

13. **Final CTA** (deep green bg, large, centered)
    - Headline: "Your body deserves more than a calorie counter."
    - Two CTAs (App Store, Google Play)
    - One-liner: "3-day free trial · Built in India · Private by design"

14. **Footer** (darkest green)
    - Logo + one-liner
    - 4 columns: Product · Science · Company · Legal
    - Bottom: copyright, contact, India location
    - Tiny: "© 2026 Productverse · Made with care in Mumbai"

## Motion & Interaction

- Hero headline fades up on load (0.6s ease-out, 0.1s delay)
- CTAs fade up after headline (0.4s, 0.4s delay)
- Subhead fades up last (0.4s, 0.6s delay)
- Scroll-triggered reveal on each section (Intersection Observer, threshold 0.15, translateY(40px) → 0)
- Trust strip slides in horizontally on first paint
- Phone mockup in vitality section has subtle parallax (translateY 20px over scroll)
- Vitality score number counts up from 0 to 87 when section enters viewport
- FAQ accordion: smooth max-height + opacity transitions
- All hover transitions: 200ms ease

## Tech Strategy

- **Stack:** Single-file `index.html` with inlined critical CSS, no external CSS framework. Minimal vanilla JS for scroll reveal + FAQ.
- **Fonts:** Google Fonts preconnect + display=swap. Inter + Fraunces + JetBrains Mono.
- **Assets:** All local relative paths. Hero video autoplay muted loop inline.
- **Performance:** Lazy-load images below the fold. Video preload="metadata" only.
- **Favicon:** Use the brand mark from `../assets/icon.png`.

## Files

```
nouriva-landing/
├── spec.md
├── index.html
├── imgs/
│   ├── phone_mockup.png
│   ├── lab_report.png
│   ├── thali_hero.png
│   ├── organs.png
│   └── people.png
└── videos/
    └── hero_loop.mp4
```