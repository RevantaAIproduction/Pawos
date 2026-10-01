import * as fs from 'fs';
import * as path from 'path';

/**
 * Retired local billing files, removed at startup so they can never act as a second source of truth
 * next to the server usage buckets. Exact relative paths under <userData>/billing only — no
 * wildcards, never a directory. Nothing here is read by the app any more:
 *  - paw-compute-config.json   old local model price table / PC scale (ignored since the anti-tamper fix)
 *  - paw-compute-capacity.json old local 5-hour / weekly PC caps (ignored)
 *  - usage-quota-config.json   old local quota numbers (ignored)
 *  - usage/google_118026972990124466573.json  an empty ledger under a retired account-key format
 *
 * Kept on purpose (still used): credits.json (local history; its retired fields are stripped by
 * CreditStore), usage-events.json and usage/<account>.json (Go/Build allowance, server ledger sync,
 * autonomous settlement), subscription.json, pricing.json, ticketPricing.json, usage.json.
 */
export const RETIRED_BILLING_FILES: readonly string[] = [
  'paw-compute-config.json',
  'paw-compute-capacity.json',
  'usage-quota-config.json',
  path.join('usage', 'google_118026972990124466573.json'),
];

/** Removes the retired files that exist. Idempotent: a missing file is a no-op. Returns what was removed. */
export function cleanupLegacyBillingFiles(userDataDir: string): string[] {
  const billingDir = path.join(userDataDir, 'billing');
  const removed: string[] = [];
  for (const relative of RETIRED_BILLING_FILES) {
    const target = path.join(billingDir, relative);
    try {
      if (!fs.lstatSync(target).isFile()) continue; // never a directory or anything else
    } catch {
      continue; // not present
    }
    try {
      fs.unlinkSync(target);
      removed.push(target);
      console.info(`[Billing] Removed retired local billing file: ${target}`);
    } catch (error) {
      console.warn(`[Billing] Could not remove retired billing file ${target}:`, error instanceof Error ? error.message : error);
    }
  }
  return removed;
}
