/**
 * Autonomous Work PC Commercial Model
 *
 * This module defines the conversion from provider cost (USD) to customer-facing
 * Work PC charges. It is the ONLY place where the 70% gross margin commercial
 * policy is enforced for autonomous work.
 *
 * Key concepts:
 * - Provider cost: actual USD paid to Gemini
 * - Customer charge: what the customer is billed (at 70% gross margin)
 * - Work PC: customer's prepaid wallet unit ($1 = 100 Work PC)
 *
 * This is SEPARATE from:
 * - Tier Compute (subscription entitlements, measured in internal normalized compute)
 * - Normal AI billing (chat, coding, reasoning — all use Tier Compute)
 *
 * DO NOT confuse autonomous Work PC with internal normalized compute.
 */

/**
 * Target gross margin for autonomous work.
 *
 * Gross margin = (Revenue - Cost) / Revenue = 0.70
 * Therefore: Revenue = Cost / (1 - 0.70) = Cost / 0.30
 */
export const AUTONOMOUS_TARGET_GROSS_MARGIN = 0.70;

/**
 * Derived markup multiplier.
 *
 * Customer charge = Provider cost × markupMultiplier
 */
export const AUTONOMOUS_MARKUP_MULTIPLIER = 1 / (1 - AUTONOMOUS_TARGET_GROSS_MARGIN);

/**
 * Customer wallet denomination: $1 of customer value = 100 Work PC.
 *
 * This must NOT change. The 70% margin is achieved by changing how much
 * Work PC a given provider cost consumes.
 */
export const WORK_PC_PER_CUSTOMER_DOLLAR = 100;

/**
 * Convert actual provider cost (USD) to customer Work PC consumption.
 *
 * Formula:
 *   customerChargeUsd = providerCostUsd * AUTONOMOUS_MARKUP_MULTIPLIER
 *   workPcConsumed = customerChargeUsd * WORK_PC_PER_CUSTOMER_DOLLAR
 *   workPcConsumed = providerCostUsd * AUTONOMOUS_MARKUP_MULTIPLIER * 100
 *   workPcConsumed = providerCostUsd / 0.30 * 100
 *
 * Example:
 *   providerCostUsd = 0.01
 *   customerChargeUsd = 0.01 / 0.30 = 0.0333...
 *   workPcConsumed = 0.0333... * 100 = 3.333...
 *
 * Rounding policy:
 *   Round to 4 decimal places (same as internal normalized compute).
 *   This preserves precision without requiring fractional PC in the DB.
 *   Conversion: work_pc = ROUND(provider_cost_usd * 1000 / 3, 4)
 *   Verification: 1000 / 3 = 333.3333..., representing the markup × customer denomination.
 */
export function providerCostToWorkPc(providerCostUsd: number): number {
  const customerChargeUsd = providerCostUsd * AUTONOMOUS_MARKUP_MULTIPLIER;
  const workPc = customerChargeUsd * WORK_PC_PER_CUSTOMER_DOLLAR;
  // Round to 4 decimal places, matching internal normalized compute precision
  return Math.round(workPc * 10_000) / 10_000;
}

/**
 * Convert customer charge (USD) to Work PC.
 *
 * Used when the customer charge is already known (e.g., from actual settlement).
 */
export function customerChargeToWorkPc(chargeUsd: number): number {
  const workPc = chargeUsd * WORK_PC_PER_CUSTOMER_DOLLAR;
  return Math.round(workPc * 10_000) / 10_000;
}

/**
 * Convert Work PC back to customer charge (USD).
 *
 * Inverse of customerChargeToWorkPc. Used for display/validation.
 */
export function workPcToCustomerCharge(workPc: number): number {
  return Math.round((workPc / WORK_PC_PER_CUSTOMER_DOLLAR) * 10_000) / 10_000;
}

/**
 * Verify the 70% margin invariant.
 *
 * Asserts that a given provider cost → customer charge → Work PC
 * produces exactly 70% gross margin.
 *
 * Returns { margin, isValid } for debugging/testing.
 */
export function verifyMargin(providerCostUsd: number, workPcConsumed: number): { margin: number; isValid: boolean } {
  const customerChargeUsd = workPcToCustomerCharge(workPcConsumed);
  const grossProfit = customerChargeUsd - providerCostUsd;
  const margin = customerChargeUsd > 0 ? grossProfit / customerChargeUsd : 0;
  // Allow tiny floating-point rounding error (< 0.1%)
  const isValid = Math.abs(margin - AUTONOMOUS_TARGET_GROSS_MARGIN) < 0.005;
  return { margin, isValid };
}
