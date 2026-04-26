# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## App Identity

The app is branded as **Nouriva AI** (not "FoodScannerApp"). Bundle ID: `in.productverse.nourivaai`. Slug: `NourivaAI`.

## Commands

```bash
# Start Expo dev server
npm start

# Run on specific platform
npm run ios
npm run android
npm run web
```

No test runner or linter is configured.

## Environment Variables

Required in `.env`:
- `EXPO_PUBLIC_GEMINI_API_KEY` — Google Gemini API key for food image analysis and medical report parsing
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key

`EXPO_TOKEN` (Expo access token) should be in `.env` when using EAS CLI; `scripts/eas-with-env.sh` sources `.env` before `eas` so it applies to all `npm run eas:*` scripts.

All are prefixed `EXPO_PUBLIC_` to be accessible client-side via `process.env`.

## EAS / iOS builds

- **`npm run eas:build:ios:setup`** — run this **first** (interactive) so iOS distribution credentials are created/validated on Expo. After one successful build, `npm run eas:build:ios` (non-interactive) can work from CI.
- **`npm run eas:build:ios`** — `eas build --non-interactive --no-wait` with `.env` loaded (uses `EXPO_TOKEN`).
- If iOS still fails in non-interactive mode with distribution certificate errors, add **App Store Connect API** details so EAS can talk to Apple without prompts: [Building on CI](https://docs.expo.dev/build/building-on-ci/) — e.g. `EXPO_APPLE_TEAM_ID`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_ASC_API_KEY_PATH` (or set these in the EAS project **Environment variables** for the production environment).

## Architecture

**Entry point:** `App.tsx` — manages the top-level auth/onboarding/biometric gate before rendering the main stack. Navigation flow:
1. `SplashScreen` (while loading)
2. `AuthScreen` (if no session or biometrics not verified)
3. `OnboardingScreen` (first run, persisted via `SecureStore`)
4. `UpgradeScreen` (paywall shown once per session via state)
5. Main stack: `ScannerScreen` → `ResultsScreen`, plus `HistoryScreen`, `ProfileScreen`, `UpgradeScreen`

**`src/screens/`** — all screens, no shared navigation types file; navigation props are typed as `any`.

**`src/utils/`**
- `gemini.ts` — calls `gemini-3-flash-preview` with a structured clinical prompt; returns parsed JSON with fields: `foodName`, `macros`, `systemicData`, `organData`, `biochemicals`, `alerts`, `balancerSuggestions`, `refs`, `vision`
- `reports.ts` — calls `gemini-3.1-pro-preview` to extract out-of-range lab markers from uploaded PDFs/images (deliberately avoids disease names per prompt design)
- `supabase.ts` — Supabase client using `expo-secure-store` as the auth storage adapter
- `history.ts` — CRUD against the `food_logs` Supabase table
- `health.ts` — stub for HealthKit/Google Fit; currently returns mock data

**`src/components/ClinicalSelector.tsx`** — modal search/select for medical conditions; contains the master `COMMON_CONDITIONS` list.

## Clinical Context System

User health context is stored in `SecureStore` under three keys and injected into every Gemini food analysis call:
- `medicalConditions` — JSON array of condition strings from `ClinicalSelector`
- `healthContext` — free-text biometric note
- `reportInsights` — auto-extracted markers from uploaded lab reports

This personalization pipeline is the core differentiator of the app. The `isPersonalized` flag passed to `ResultsScreen` reflects whether any context was found.

## Supabase Schema

The app uses a single `food_logs` table with columns: `id`, `user_id`, `food_name`, `vitality_score`, `image_base64`, `steps`, `heart_rate`, `sleep_hours`, `macros` (jsonb), `created_at`.
