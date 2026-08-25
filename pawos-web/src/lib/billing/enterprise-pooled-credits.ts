/**
 * Enterprise Pooled Credits Billing System
 *
 * Separate from individual Pro/Enterprise user quotas.
 * Organization-wide pool with use-first, pay-later settlement.
 *
 * Schema:
 * - enterprise_pooled_credits: tracks org pool state
 * - enterprise_pooled_usage: settlement records
 */

export const CREDITS_PER_USD = 100; // 2,000 credits/month = $20/month
export const USD_INR_RATE = 95.65;
export const LOW_BALANCE_THRESHOLD = 200_000; // credits
export const MAX_SUPPORTED_SETTLEMENT_USD = 20_000;
export const MAX_SUPPORTED_SETTLEMENT_INR = Math.round(MAX_SUPPORTED_SETTLEMENT_USD * USD_INR_RATE);
export const MAX_CUSTOM_POOL_CREDITS = 2_000_000; // = $20,000 maximum
export const MAX_ENTERPRISE_SEATS = 20;

/**
 * Monthly pooled-credit allocations for Enterprise
 * Month 1 = index 0, Month 2 = index 1, etc.
 */
export const MONTHLY_POOLED_ALLOCATIONS: readonly number[] = [70_000, 100_000, 150_000];

export interface EnterprisePooledCreditState {
  organizationId: string;
  /** Total credits available in the current pool */
  pooledCreditLimit: number;
  /** Credits already consumed from the pool */
  pooledCreditsConsumed: number;
  /** Credits remaining = limit - consumed */
  pooledCreditsRemaining: number;
  /** USD value of consumed credits (consumed / CREDITS_PER_USD) */
  outstandingAmountUsd: number;
  /** Month index (0-based) for the current billing cycle */
  currentBillingMonth: number;
  /** Timestamp of current billing cycle start */
  billingCycleStartedAt: number;
  /** Whether org is in 'low balance' warning state */
  isLowBalance: boolean;
  /** Whether org has exhausted the pool and must settle before continued usage */
  isExhausted: boolean;
  /** Amount paid in current settlement (if any) */
  settledAmountUsd: number;
  /** Invoice IDs for current settlement (if any) */
  settlementInvoiceIds: string[];
  /** Settlement status: 'none' | 'pending' | 'paid' */
  settlementStatus: 'none' | 'pending' | 'paid';
}

export function calculateMonthlyAllocation(monthIndex: number): number {
  if (monthIndex < MONTHLY_POOLED_ALLOCATIONS.length) {
    return MONTHLY_POOLED_ALLOCATIONS[monthIndex];
  }
  // Month 4+: organization must request custom pool
  // Until requested, allocation is the prior month's amount (no automatic increase)
  return MONTHLY_POOLED_ALLOCATIONS[MONTHLY_POOLED_ALLOCATIONS.length - 1];
}

export function calculateOutstandingUsd(creditsConsumed: number): number {
  return Math.round((creditsConsumed / CREDITS_PER_USD) * 100) / 100;
}

export function calculateOutstandingInr(creditsConsumed: number): number {
  const usd = calculateOutstandingUsd(creditsConsumed);
  return Math.round(usd * USD_INR_RATE);
}

export function shouldShowLowBalanceWarning(remaining: number): boolean {
  return remaining <= LOW_BALANCE_THRESHOLD && remaining > 0;
}

export function isPoolExhausted(remaining: number): boolean {
  return remaining === 0;
}

export function validateSettlementAmount(amountUsd: number): { valid: boolean; error?: string } {
  if (amountUsd <= 0) {
    return { valid: false, error: 'Settlement amount must be greater than $0.' };
  }
  if (amountUsd > MAX_SUPPORTED_SETTLEMENT_USD) {
    return { valid: false, error: `Maximum settlement is $${MAX_SUPPORTED_SETTLEMENT_USD.toLocaleString()}. Contact sales for larger amounts.` };
  }
  return { valid: true };
}

export function calculateInvoiceRoute(amountUsd: number): 'normal' | 'high-value' {
  return amountUsd > 500 ? 'high-value' : 'normal';
}
