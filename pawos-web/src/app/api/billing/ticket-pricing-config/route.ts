import { NextResponse } from "next/server";
import { getTicketPricingConfig } from "@/lib/billing/razorpay";

/**
 * Real, editable Ticket Balance top-up presets/minimum — read server-side from env vars (see
 * getTicketPricingConfig()) so the client-side checkout UI never hardcodes the preset list.
 */
export async function GET() {
  return NextResponse.json(getTicketPricingConfig());
}
