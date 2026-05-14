/**
 * Pending result store — avoids passing large LLM result objects
 * through React Navigation route params.
 *
 * React Navigation serialises route params via JSON.stringify when updating
 * navigation state. For a full Nouriva analysis result (~15–20 KB of JSON),
 * this exhausts the Hermes GC scope's internal chunk pool and triggers:
 *   ___BUG_IN_CLIENT_OF_LIBMALLOC_POINTER_BEING_FREED_WAS_NOT_ALLOCATED
 * in stringPrototypeCharCodeAt on iOS.
 *
 * Solution: store the result here (module-level, synchronous, zero serialisation)
 * and pass only a lightweight token through navigation params.
 */

import type { FoodScanResult } from './llm';

let _pendingResult: FoodScanResult | null = null;
let _pendingImageUri: string | undefined;
let _pendingOriginalImage: string | undefined;
let _pendingIsPersonalized: boolean = false;

/** Drop enormous / diagnostic-only fields before retaining in RAM (Hermes pressure + JS/native churn). */
function mealResultForPendingStore(result: FoodScanResult): FoodScanResult {
  if (!result || typeof result !== 'object') return result;
  const { rawText: _rt, rawResponse: _rr, ...rest } = result as FoodScanResult & {
    rawText?: unknown;
    rawResponse?: unknown;
  };
  const out = { ...rest } as FoodScanResult;
  const vision = (out as { vision?: unknown }).vision;
  if (Array.isArray(vision) && vision.length > 64) {
    (out as { vision: unknown[] }).vision = vision.slice(0, 64);
  }
  return out;
}

export function setPendingResult(
  result: FoodScanResult,
  opts?: {
    imageUri?: string;
    originalImage?: string;
    isPersonalized?: boolean;
  },
) {
  _pendingResult = mealResultForPendingStore(result);
  _pendingImageUri = opts?.imageUri;
  _pendingOriginalImage = opts?.originalImage;
  _pendingIsPersonalized = opts?.isPersonalized ?? false;
}

export function consumePendingResult(): {
  result: FoodScanResult;
  imageUri: string | undefined;
  originalImage: string | undefined;
  isPersonalized: boolean;
} | null {
  if (!_pendingResult) return null;
  const out = {
    result: _pendingResult,
    imageUri: _pendingImageUri,
    originalImage: _pendingOriginalImage,
    isPersonalized: _pendingIsPersonalized,
  };
  // Clear after consuming so there's no stale reference.
  _pendingResult = null;
  _pendingImageUri = undefined;
  _pendingOriginalImage = undefined;
  _pendingIsPersonalized = false;
  return out;
}

export function hasPendingResult(): boolean {
  return _pendingResult !== null;
}
