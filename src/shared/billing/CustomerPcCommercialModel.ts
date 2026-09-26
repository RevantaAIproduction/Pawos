export const CUSTOMER_PC_PER_USD = 100;
export const NORMALIZED_COMPUTE_PER_USD = 1000;
/**
 * What PawOS charges per $1 of real model cost: $1 of Gemini spend is charged as $3 of value, i.e.
 * 300 customer PC. Applies to tier allowances and purchased credits alike. Autonomous tickets are
 * priced separately (AutonomousWorkPcCommercialModel.ts).
 */
export const CUSTOMER_PC_MARKUP = 3;
export const NORMALIZED_TO_CUSTOMER_PC_RATIO = (CUSTOMER_PC_PER_USD / NORMALIZED_COMPUTE_PER_USD) * CUSTOMER_PC_MARKUP; // 0.3

export function normalizedComputeToCustomerPc(normalizedCompute: number): number {
  return Math.round((normalizedCompute * NORMALIZED_TO_CUSTOMER_PC_RATIO) * 10000) / 10000;
}

export function customerPurchaseUsdToPurchasedPc(purchaseUsd: number): number {
  return Math.round((purchaseUsd * CUSTOMER_PC_PER_USD) * 10000) / 10000;
}

export function customerPcToPurchaseUsd(customerPc: number): number {
  return Math.round((customerPc / CUSTOMER_PC_PER_USD) * 10000) / 10000;
}
