import { NextResponse } from "next/server";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayCredentials,
  verifyRazorpayOrderPaymentSignature,
  type SubscriptionTierId,
} from "@/lib/billing/razorpay";
import { createServiceClient } from "@/lib/supabase/serviceClient";

/**
 * Verifies a tier purchase payment and activates the tier for the user.
 * Mirrors the existing verify-subscription flow but for one-time Orders instead of Subscriptions.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const orderId = body?.orderId as string | undefined;
  const paymentId = body?.paymentId as string | undefined;
  const signature = body?.signature as string | undefined;

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ ok: false, reason: "Missing payment verification data." }, { status: 400 });
  }

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, reason: "Payment processing is not configured. Business Configuration Required." }, { status: 503 });
  }

  // ---- Verify payment signature ----
  if (!verifyRazorpayOrderPaymentSignature(orderId, paymentId, signature, credentials.keySecret)) {
    return NextResponse.json({ ok: false, reason: "Invalid payment signature." }, { status: 400 });
  }

  // ---- Fetch order from Razorpay to confirm payment is captured ----
  const order = await fetchRazorpayOrder(orderId, credentials);
  if (!order) {
    return NextResponse.json({ ok: false, reason: "Could not verify the order with Razorpay." }, { status: 502 });
  }

  // ---- Verify order status is paid ----
  if (order.status !== "paid") {
    return NextResponse.json({ ok: false, reason: `Order is not paid (status: ${order.status}).` }, { status: 402 });
  }

  // ---- Fetch payment from Razorpay to confirm it belongs to the order ----
  const payment = await fetchRazorpayPayment(paymentId, credentials);
  if (!payment) {
    return NextResponse.json({ ok: false, reason: "Could not verify the payment with Razorpay." }, { status: 502 });
  }
  if (payment.order_id !== orderId) {
    return NextResponse.json({ ok: false, reason: "Payment does not match the specified order." }, { status: 400 });
  }
  if (payment.status !== "captured") {
    return NextResponse.json({ ok: false, reason: `Payment is not captured (status: ${payment.status}).` }, { status: 402 });
  }

  // ---- Extract tier info from order notes (Razorpay-attested, not client-supplied) ----
  const productType = order.notes?.productType ?? "";
  if (productType !== "tier_purchase") {
    return NextResponse.json({ ok: false, reason: "Order does not correspond to a tier purchase." }, { status: 400 });
  }

  const tier = order.notes?.tier as SubscriptionTierId | undefined;
  if (!tier || !["pro", "proMax", "team", "enterprise"].includes(tier)) {
    return NextResponse.json({ ok: false, reason: "Order tier is invalid or missing." }, { status: 400 });
  }

  const seatCount = order.notes?.seatCount ? Number(order.notes.seatCount) : undefined;

  // ---- Extract user ID from order notes ----
  const userId = typeof order.notes?.userId === "string" ? order.notes.userId : null;
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "Order does not have a valid user ID." }, { status: 400 });
  }

  // Calculate USD amount from INR paise
  const amountInr = order.amount / 100; // Convert paise to INR
  const amountUsd = amountInr / 95.65; // Standard conversion rate

  // ---- Log payment event for audit/analytics (async, non-blocking) ----
  const serviceClient = createServiceClient();
  try {
    await serviceClient
      .from("payment_events")
      .insert({
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        webhook_event_id: `tier-purchase-${orderId}-${Date.now()}`,
        user_id: userId,
        organization_id: null,
        event_type: "tier_purchase",
        amount: Math.round(amountInr),
        currency: "INR",
      });
  } catch (error) {
    console.warn("[verify-tier-payment] Payment event logging failed:", error);
  }

  console.log("[verify-tier-payment] Payment verified for user", userId, "tier:", tier, "amountUsd:", amountUsd);

  // ---- Activate Team/Enterprise tier (create org if needed) ----
  if (tier === "team" || tier === "enterprise") {
    activateOrganizationTierAsync(userId, tier, seatCount).catch((error) => {
      console.warn("[verify-tier-payment] Organization tier activation failed:", error);
    });
  }

  // ---- Grant $40 one-time benefit if eligible ----
  if (["pro", "proMax", "team", "enterprise"].includes(tier)) {
    grantOneTimeBenefitAsync(userId).catch((error) => {
      console.warn("[verify-tier-payment] One-time benefit grant failed:", error);
    });
  }

  return NextResponse.json({
    ok: true,
    amountUsd: Math.round(amountUsd * 100) / 100, // Round to 2 decimals
  });
}

/**
 * Activates Team/Enterprise tier by creating an organization for the user.
 * Creates a single organization (first one) for the user with the purchased tier and seat count.
 * If the user already has an organization, updates its tier and seat_count instead.
 * This runs asynchronously (fire-and-forget) since it's non-blocking to the payment verification.
 */
async function activateOrganizationTierAsync(userId: string, tier: "team" | "enterprise", seatCount?: number): Promise<void> {
  try {
    const serviceClient = createServiceClient();

    // First, fetch the user to get their email domain
    const { data: { user: authUser }, error: authError } = await serviceClient.auth.admin.getUserById(userId);
    if (authError || !authUser?.email) {
      console.warn("[verify-tier-payment] Failed to fetch user for org activation:", authError);
      return;
    }

    const domain = authUser.email.split("@")[1]?.toLowerCase() || "";
    if (!domain) {
      console.warn("[verify-tier-payment] User has no valid email domain for org activation");
      return;
    }

    // Check if user already has an organization for this domain
    const { data: existingOrgs, error: queryError } = await serviceClient
      .from("organizations")
      .select("id, name, tier")
      .eq("owner_user_id", userId)
      .eq("domain", domain)
      .limit(1);

    if (queryError) {
      console.warn("[verify-tier-payment] Failed to query existing organizations:", queryError);
      return;
    }

    if (existingOrgs && existingOrgs.length > 0) {
      // Organization exists — update tier and seatCount
      const orgId = existingOrgs[0].id;
      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          tier,
          seat_count: tier === "enterprise" ? (seatCount || 20) : (seatCount || 2),
        })
        .eq("id", orgId);

      if (updateError) {
        console.warn("[verify-tier-payment] Failed to update organization tier:", updateError);
        return;
      }

      console.log("[verify-tier-payment] Organization tier updated:", orgId, "tier:", tier, "seatCount:", seatCount);
    } else {
      // No organization exists — create one with the purchased tier
      const { data: slugData, error: slugError } = await serviceClient.rpc("generate_org_slug", {
        org_name: domain.split(".")[0] || "Organization",
      });

      if (slugError || !slugData) {
        console.warn("[verify-tier-payment] Failed to generate org slug:", slugError);
        return;
      }

      const { data: newOrg, error: createError } = await serviceClient
        .from("organizations")
        .insert({
          name: domain,
          slug: slugData,
          tier,
          owner_user_id: userId,
          domain,
          seat_count: tier === "enterprise" ? (seatCount || 20) : (seatCount || 2),
        })
        .select("id")
        .single();

      if (createError) {
        console.warn("[verify-tier-payment] Failed to create organization:", createError);
        return;
      }

      console.log("[verify-tier-payment] Organization created:", newOrg.id, "tier:", tier, "seatCount:", seatCount);

      // Add the owner as an organizationOwner member
      const ownerRole = tier === "enterprise" ? "organizationOwner" : "owner";
      const { error: memberError } = await serviceClient.from("organization_members").insert({
        organization_id: newOrg.id,
        user_id: userId,
        email: authUser.email,
        display_name: authUser.user_metadata?.full_name || null,
        role: ownerRole,
        status: "active",
        joined_at: new Date().toISOString(),
      });

      if (memberError) {
        console.warn("[verify-tier-payment] Failed to add owner to organization:", memberError);
        return;
      }
    }
  } catch (error) {
    console.warn("[verify-tier-payment] Organization tier activation exception:", error);
  }
}

/**
 * Grants the $40 one-time onboarding benefit to a user for their first eligible tier purchase.
 * The grant is idempotent: if the user has already received it, this is a no-op.
 * Uses a special phantom payment marker ("onetime-benefit-<userId>") to track idempotently.
 */
async function grantOneTimeBenefitAsync(userId: string): Promise<void> {
  const uniquePaymentId = `onetime-benefit-${userId}`;
  try {
    const serviceClient = createServiceClient();
    // Call add_ticket_balance_service with the phantom payment ID — idempotent on payment ID.
    // If this user already received the benefit, the RPC will return the existing topup ID (no-op).
    const { data: topupId, error: rpcError } = await serviceClient.rpc("add_ticket_balance_service", {
      p_user_id: userId,
      p_organization_id: null,
      p_amount_usd: 40,
      p_razorpay_payment_id: uniquePaymentId,
    });
    if (rpcError) {
      console.warn("[verify-tier-payment] Failed to grant one-time benefit:", rpcError.message);
      return;
    }
    console.log("[verify-tier-payment] One-time benefit granted to user", userId, "topupId:", topupId);
  } catch (error) {
    console.warn("[verify-tier-payment] One-time benefit grant request failed:", error);
  }
}
