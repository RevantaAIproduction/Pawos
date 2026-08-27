import { NextResponse } from "next/server";
import { getRazorpayWebhookSecret, verifyRazorpayWebhookSignature, getRazorpayPlanId } from "@/lib/billing/razorpay";
import { creditVerifiedTicketBalancePayment } from "@/lib/billing/ticketBalanceCrediting";
import { creditVerifiedUsageCreditsPayment } from "@/lib/billing/usageCreditsCrediting";

import { createServiceClient } from "@/lib/supabase/serviceClient";

type RazorpayWebhookEvent = {
  event: string;
  payload: Record<string, { entity: Record<string, unknown> }>;
};

/**
 * Applies a verified Razorpay SUBSCRIPTION event to the user's subscription record.
 * pawos-web has no persistent account/subscription database yet (auth and
 * subscription state today live only inside the Electron app's local
 * stores) — that's a real infrastructure decision out of scope here, so
 * this honestly logs the verified event instead of writing to a database
 * that doesn't exist. Once a real accounts database is wired up, this is
 * the one place that needs to change to persist it.
 */
function applySubscriptionEvent(event: RazorpayWebhookEvent): void {
  console.log(`[razorpay-webhook] Verified subscription event "${event.event}" received — no persistent account database configured yet, not persisted.`, {
    event: event.event,
    subscriptionId: event.payload.subscription?.entity?.id,
    paymentId: event.payload.payment?.entity?.id,
  });
}

/**
 * Handles tier_purchase webhook events (backup path if client-side verify fails).
 * Activates Team/Enterprise tier by creating organization if needed.
 * This is a fire-and-forget async operation — errors are logged but don't block webhook response.
 */
async function handleTierPurchaseWebhookAsync(
  paymentEntity: { id?: string; order_id?: string | null; notes?: Record<string, string> } | undefined,
  paymentId: string,
  orderId: string
): Promise<void> {
  if (!paymentEntity?.notes) {
    console.warn("[razorpay-webhook] Tier purchase event missing payment notes");
    return;
  }

  const userId = paymentEntity.notes.userId;
  const tier = paymentEntity.notes.tier as "team" | "enterprise" | undefined;
  const seatCountStr = paymentEntity.notes.seatCount;
  const seatCount = seatCountStr ? Number(seatCountStr) : undefined;

  if (!userId) {
    console.warn("[razorpay-webhook] Tier purchase event missing userId");
    return;
  }

  if (!tier || !["team", "enterprise"].includes(tier)) {
    console.warn("[razorpay-webhook] Tier purchase event has invalid tier:", tier);
    return;
  }

  try {
    const serviceClient = createServiceClient();

    // Fetch user email from Supabase Auth
    const { data: { user: authUser }, error: authError } = await serviceClient.auth.admin.getUserById(userId);
    if (authError || !authUser?.email) {
      console.warn("[razorpay-webhook] Failed to fetch user for tier activation:", authError);
      return;
    }

    const domain = authUser.email.split("@")[1]?.toLowerCase() || "";
    if (!domain) {
      console.warn("[razorpay-webhook] User has no valid email domain");
      return;
    }

    // Check if organization exists
    const { data: existingOrgs, error: queryError } = await serviceClient
      .from("organizations")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("domain", domain)
      .limit(1);

    if (queryError) {
      console.warn("[razorpay-webhook] Failed to query existing organizations:", queryError);
      return;
    }

    if (existingOrgs && existingOrgs.length > 0) {
      // Update existing org
      const { error: updateError } = await serviceClient
        .from("organizations")
        .update({
          tier,
          seat_count: tier === "enterprise" ? (seatCount || 20) : (seatCount || 2),
        })
        .eq("id", existingOrgs[0].id);

      if (updateError) {
        console.warn("[razorpay-webhook] Failed to update organization tier:", updateError);
        return;
      }

      console.log("[razorpay-webhook] Organization tier updated for tier purchase:", existingOrgs[0].id);
    } else {
      // Create new org
      const { data: slugData, error: slugError } = await serviceClient.rpc("generate_org_slug", {
        org_name: domain.split(".")[0] || "Organization",
      });

      if (slugError || !slugData) {
        console.warn("[razorpay-webhook] Failed to generate org slug:", slugError);
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
        console.warn("[razorpay-webhook] Failed to create organization:", createError);
        return;
      }

      // Add owner as member
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
        console.warn("[razorpay-webhook] Failed to add owner to organization:", memberError);
        return;
      }

      console.log("[razorpay-webhook] Organization created for tier purchase:", newOrg.id);
    }
  } catch (error) {
    console.warn("[razorpay-webhook] Tier purchase webhook exception:", error);
  }
}

/**
 * Handles a verified `payment.captured` event for a ONE-TIME Ticket Balance top-up Order — the
 * webhook's own independent crediting path (Phase 2), separate from and race-safe against the
 * browser-callback route (/api/billing/credit-ticket-balance): both ultimately call the same
 * idempotent add_ticket_balance_service() RPC (unique on razorpay_payment_id), so whichever one
 * reaches it first credits the wallet and the other becomes a harmless no-op returning the same
 * topup id — never a double credit, regardless of which arrives first or if both race.
 *
 * A `payment.captured` event's own `order_id` is used to distinguish a subscription payment
 * (handled by applySubscriptionEvent above — a subscription payment's order isn't a Ticket Balance
 * top-up Order and has no `notes.userId`) from a real top-up payment. Any payment whose order lacks
 * a recorded payer identity in `notes` is honestly skipped rather than guessed at.
 */
async function applyPaymentCapturedEvent(event: RazorpayWebhookEvent): Promise<void> {
  const paymentEntity = event.payload.payment?.entity as
    | { id?: string; order_id?: string | null; notes?: Record<string, string> }
    | undefined;
  const paymentId = paymentEntity?.id;
  const orderId = paymentEntity?.order_id;
  if (!paymentId || !orderId) {
    console.warn("[razorpay-webhook] payment.captured event missing payment id or order id — skipping.");
    return;
  }

  // Dispatch to the correct handler based on the server-stamped productType in the
  // payment entity's notes. Razorpay includes the order's notes in the payment entity in webhook
  // payloads, making this field available without an extra Razorpay API call.
  //
  // The productType was stamped at order-creation time in:
  //   - /api/billing/checkout-credits     → "ticket_balance"  (Autonomous Work Credits)
  //   - /api/billing/checkout-usage-credits → "usage_credits" (Usage Credits)
  //   - /api/billing/checkout-tier         → "tier_purchase"  (Team/Enterprise tier purchase)
  //
  // Neither crediting function ever trusts the webhook payload's amount — both independently
  // re-fetch the payment and order from Razorpay's own API for authoritative amount verification.
  const productType = paymentEntity?.notes?.productType;

  // Handle tier purchases via webhook (backup path if client-side verify fails)
  if (productType === "tier_purchase") {
    await handleTierPurchaseWebhookAsync(paymentEntity, paymentId, orderId).catch((error) => {
      console.warn(`[razorpay-webhook] Tier purchase webhook handling failed for ${paymentId}:`, error);
    });
    return;
  }

  const baseParams = {
    orderId,
    paymentId,
    signature: "", // irrelevant here — webhook authenticity already proven via verifyRazorpayWebhookSignature above.
    identity: { source: "orderNotes" as const },
  };

  const result = await (productType === "usage_credits"
    ? creditVerifiedUsageCreditsPayment(baseParams)
    : creditVerifiedTicketBalancePayment(baseParams) // default: "ticket_balance" (or legacy orders without productType)
  ).catch((error) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) }));

  if (!result.ok) {
    console.log(`[razorpay-webhook] payment.captured for ${paymentId} (${productType ?? "ticket_balance"}) not credited via webhook: ${result.reason}`);
    return;
  }
  console.log(`[razorpay-webhook] payment.captured for ${paymentId} (${productType ?? "ticket_balance"}) credited $${result.amountUsd} (topupId: ${result.topupId}).`);
}

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.activated",
  "subscription.charged",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.pending",
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    // Nothing to verify against yet — acknowledge so Razorpay doesn't retry indefinitely, but do nothing (Business Configuration Required).
    console.warn("[razorpay-webhook] Received a webhook but RAZORPAY_WEBHOOK_SECRET is not configured. Ignoring.");
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (!signature || !verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, reason: "Invalid webhook signature." }, { status: 400 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid webhook payload." }, { status: 400 });
  }

  if (event.event === "payment.captured") {
    await applyPaymentCapturedEvent(event);
  } else if (SUBSCRIPTION_EVENTS.has(event.event)) {
    applySubscriptionEvent(event);
  } else if (event.event === "payment.failed" || event.event === "refund.processed") {
    // Failed/refund events affecting the wallet: honestly logged, never auto-reversing an already
    // -credited balance (clawback after funds may already be spent is a distinct business-policy
    // decision, out of scope here) and never duplicating a credit for a payment that never captured.
    console.log(`[razorpay-webhook] Verified "${event.event}" event received — no automatic wallet action taken.`, {
      paymentId: event.payload.payment?.entity?.id,
    });
  } else {
    console.log(`[razorpay-webhook] Verified event "${event.event}" received — no handler for this event type.`);
  }

  return NextResponse.json({ ok: true });
}
