import { NextResponse } from "next/server";
import { getConfiguredPaymentMethods } from "@/lib/billing/razorpay";

/**
 * PawOS renders its own checkout UI, but it must not invent which payment
 * methods are enabled. This route exposes the deploy-time Razorpay account
 * method configuration without exposing any Razorpay secret.
 */
export async function GET() {
  const methods = getConfiguredPaymentMethods();
  if (methods.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        reason: "Payment methods are not configured yet. Business Configuration Required.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, methods });
}
