import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * GET: Fetch Enterprise pooled-credit status for an organization
 * POST: Update pooled-credit allocation (admin only)
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const accessToken = url.searchParams.get("accessToken") || request.headers.get("authorization")?.replace("Bearer ", "");

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

    // Verify user is member of organization
    const membershipClient = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: membership } = await membershipClient
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, reason: "You are not a member of that organization." }, { status: 403 });
    }

    // Fetch pooled credit state
    const { data: pooledState, error: stateError } = await membershipClient
      .from("enterprise_pooled_credits")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (stateError && stateError.code !== "PGRST116") {
      return NextResponse.json({ ok: false, reason: "Failed to fetch pooled credit status." }, { status: 500 });
    }

    // Organization doesn't have an Enterprise subscription yet
    if (!pooledState) {
      return NextResponse.json({
        ok: true,
        hasEnterprise: false,
        pooledCredits: null,
      });
    }

    return NextResponse.json({
      ok: true,
      hasEnterprise: true,
      pooledCredits: {
        organizationId: pooledState.organization_id,
        pooledCreditLimit: pooledState.pooled_credit_limit,
        pooledCreditsConsumed: pooledState.pooled_credits_consumed,
        pooledCreditsRemaining: pooledState.pooled_credit_limit - pooledState.pooled_credits_consumed,
        outstandingAmountUsd: pooledState.pooled_credits_consumed / 100,
        currentBillingMonth: pooledState.current_billing_month,
        billingCycleStartedAt: new Date(pooledState.billing_cycle_started_at).getTime(),
        isLowBalance: (pooledState.pooled_credit_limit - pooledState.pooled_credits_consumed) <= 200_000,
        isExhausted: (pooledState.pooled_credit_limit - pooledState.pooled_credits_consumed) === 0,
        settlementStatus: pooledState.settlement_status,
        settlementInvoiceIds: pooledState.settlement_invoice_ids || [],
        settledAmountUsd: pooledState.settled_amount_usd || 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Failed to fetch status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const organizationId = body?.organizationId as string | undefined;
  const accessToken = body?.accessToken as string | undefined;
  const newPoolLimit = typeof body?.newPoolLimit === "number" ? body.newPoolLimit : undefined;

  if (!accessToken || !organizationId || !newPoolLimit) {
    return NextResponse.json({ ok: false, reason: "Missing required fields." }, { status: 400 });
  }

  // Validate new pool limit (maximum $20,000 = 2,000,000 credits)
  if (newPoolLimit < 1 || newPoolLimit > 2_000_000) {
    return NextResponse.json({
      ok: false,
      reason: "Pool limit must be between 1 and 2,000,000 credits (maximum $20,000).",
    }, { status: 400 });
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
        reason: "Only organization admins can update pooled credit limits.",
      }, { status: 403 });
    }

    // Update pool limit
    const { error: updateError } = await membershipClient
      .from("enterprise_pooled_credits")
      .update({ pooled_credit_limit: newPoolLimit })
      .eq("organization_id", organizationId);

    if (updateError) {
      return NextResponse.json({ ok: false, reason: "Failed to update pool limit." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Pool limit updated successfully." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Update failed." },
      { status: 500 }
    );
  }
}
