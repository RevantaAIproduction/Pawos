import type { GeneratedImageInfo, ImageAllowance, ImageGenerateResult } from '../../../shared/images/ImageGenerationTypes';

/** What one image will cost this account, in words. The numbers come from the server. */
export function imagePriceLine(allowance: ImageAllowance | null): string {
  if (!allowance) return 'Checking the price…';
  if (allowance.funding === 'organization') return "Uses 1 unit of your organization's shared monthly usage.";
  if (allowance.funding === 'free_then_credits' && allowance.freeImagesLeft !== null && allowance.freeImagesLeft > 0) {
    return `Free — ${allowance.freeImagesLeft} of 3 free images left.`;
  }
  if (allowance.funding === 'free_then_credits') return `Uses ${allowance.chargePc} PC of your purchased credits.`;
  return `Uses ${allowance.chargePc} PC of your plan's usage.`;
}

/** What one finished image cost, in words. */
export function imageChargedLine(image: Pick<GeneratedImageInfo, 'funding' | 'chargedPc'>): string {
  if (image.funding === 'free') return 'Free image — no usage charged.';
  if (image.funding === 'organization') return "Used 1 unit of your organization's shared usage.";
  return `Used ${image.chargedPc} PC.`;
}

/**
 * The request id the next Generate press sends. A request the server never answered (or is still
 * making) is asked again with the SAME id — the server then returns that image, never a second one.
 */
export function nextImageRequestId(previous: string | null, lastResult: ImageGenerateResult | null, makeId: () => string): string {
  if (previous && lastResult && !lastResult.ok && !lastResult.answered) return previous;
  return makeId();
}

export const newImageRequestId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
