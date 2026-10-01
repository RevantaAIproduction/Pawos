import { NextResponse } from "next/server";
import { getTicketBalanceUsdInrRate, getUsageCreditsPricingConfig } from "@/lib/billing/razorpay";

/**
 * The customer-facing configuration of the credits purchase UI — presets, minimum, maximum, the INR
 * rate used at checkout and the customer PC per dollar — read server-side so the desktop never
 * hardcodes pricing. Customer-facing values only (no private allowance or provider economics).
 */
export async function GET() {
  const { topupPresetsUsd, minTopupUsd, maxTopupUsd } = getUsageCreditsPricingConfig();
  return NextResponse.json({
    topupPresetsUsd,
    minTopupUsd,
    maxTopupUsd,
    usdInrRate: getTicketBalanceUsdInrRate(),
    pcPerUsd: CUSTOMER_PC_PER_USD,
  });
}

/** The customer-value rule: $1 of customer value = 100 PC. */
const CUSTOMER_PC_PER_USD = 100;
