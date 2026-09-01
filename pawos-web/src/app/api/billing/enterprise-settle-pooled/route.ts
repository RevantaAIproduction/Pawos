import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { calculateOutstandingUsd, calculateInvoiceRoute, MAX_SUPPORTED_SETTLEMENT_USD } from "@/lib/billing/enterprise-pooled-credits";

/**
 * POST: Start early settlement of Enterprise pooled usage
 *
 * Calculates outstanding amount from consumed credits.
 * Routes to normal or high-value checkout based on amount.
 * Creates payment session/invoice but does NOT credit pool until payment confirmed.
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const organizationId = body?.organizationId as string | undefined;
  const accessToken = body?.accessToken as string | undefined;

  if (!accessToken || !organizationId) {
    return NextResponse.json({ ok: false, reason: "Missing accessToken or organizationId." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const authClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
    }

    // Verify user is admin of organization
    const membershipClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: membership } = await membershipClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({
        ok: false,
        reason: "Only organization admins can settle pooled usage.",
      }, { status: 403 });
    }

    // Fetch current pooled credit state
    const { data: pooledState, error: stateError } = await membershipClient
      .from("enterprise_pooled_credits")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (stateError || !pooledState) {
      return NextResponse.json({
        ok: false,
        reason: "Organization does not have an Enterprise subscription.",
      }, { status: 400 });
    }

    // Check if there's anything to settle
    if (pooledState.pooled_credits_consumed === 0) {
      return NextResponse.json({
        ok: false,
        reason: "No outstanding pooled usage to settle.",
      }, { status: 400 });
    }

    // Calculate settlement amount
    const creditsConsumed = pooledState.pooled_credits_consumed;
    const outstandingUsd = calculateOutstandingUsd(creditsConsumed);
    const route = calculateInvoiceRoute(outstandingUsd);

    // Validate amount
    if (outstandingUsd > MAX_SUPPORTED_SETTLEMENT_USD) {
      return NextResponse.json({
        ok: false,
        reason: `Outstanding amount ($${outstandingUsd.toLocaleString()}) exceeds maximum supported settlement ($${MAX_SUPPORTED_SETTLEMENT_USD.toLocaleString()}). Please contact our sales team.`,
      }, { status: 400 });
    }

    // Mark settlement as pending (before payment flow)
    const { error: updateError } = await membershipClient
      .from("enterprise_pooled_credits")
      .update({
        settlement_status: "pending",
      })
      .eq("organization_id", organizationId);

    if (updateError) {
      return NextResponse.json({ ok: false, reason: "Failed to initiate settlement." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      settlementDetails: {
        organizationId,
        creditsConsumed,
        outstandingAmountUsd: outstandingUsd,
        paymentRoute: route,
        message: route === "high-value"
          ? `Outstanding amount: $${outstandingUsd.toLocaleString()}. Proceeding to invoice flow.`
          : `Outstanding amount: $${outstandingUsd.toLocaleString()}. Proceeding to payment.`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Settlement initiation failed." },
      { status: 500 }
    );
  }
}
