import { CUSTOMER_PC_PER_USD } from './CustomerPcCommercialModel';

/**
 * Past the plan's code-file cap (weekly; monthly on Go), each further counted file — a new file, or
 * an edit of 30+ lines — is paid from purchased Paw Compute: $1 = 5 files, or 8 small files. "Small"
 * applies to new and edited files alike, by lines written / changed. All tiers; not in PawOS Build's
 * final week (Upgrade to Pro only). Autonomous Work is billed through Ticket Balance instead.
 */
export const FILE_OVERAGE_USD = 0.2;
export const SMALL_FILE_OVERAGE_USD = 0.125;
/** Fewer lines than this (new file length, or lines changed by an edit) makes a file "small". */
export const SMALL_FILE_MAX_LINES = 100;

export function fileOveragePriceUsd(lines: number): number {
  return lines < SMALL_FILE_MAX_LINES ? SMALL_FILE_OVERAGE_USD : FILE_OVERAGE_USD;
}

export function fileOveragePricePc(lines: number): number {
  return Math.round(fileOveragePriceUsd(lines) * CUSTOMER_PC_PER_USD * 10000) / 10000;
}
