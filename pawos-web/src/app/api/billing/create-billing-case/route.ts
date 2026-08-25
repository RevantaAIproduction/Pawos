import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { assignPersonaForConversation } from "@/shared/support/SupportPersonas";

/**
 * Creates a billing case for high-value Team/Enterprise orders.
 * Assigns a persona, stores all context, and returns case ID + persona.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : undefined;
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : undefined;
  const tier = typeof body?.tier === "string" ? body.tier : undefined;
  const plan = typeof body?.plan === "string" ? body.plan : undefined;
  const memberCount = typeof body?.memberCount === "number" ? body.memberCount : undefined;
  const normalCreditAmountUsd = typeof body?.normalCreditAmountUsd === "number" ? body.normalCreditAmountUsd : undefined;
  const autonomousTicketAmountUsd = typeof body?.autonomousTicketAmountUsd === "number" ? body.autonomousTicketAmountUsd : undefined;
  const customerName = typeof body?.customerName === "string" ? body.customerName : undefined;
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName : undefined;
  const billingEmail = typeof body?.billingEmail === "string" ? body.billingEmail : undefined;
  const gstPercent = typeof body?.gstPercent === "number" ? body.gstPercent : undefined;
  const amountUsd = typeof body?.amountUsd === "number" ? body.amountUsd : undefined;
  const amountInr = typeof body?.amountInr === "number" ? body.amountInr : undefined;

  if (!accessToken || !organizationId || !tier || !memberCount || !customerName || !organizationName || !billingEmail || amountUsd === undefined || !amountInr) {
    return NextResponse.json(
      { ok: false, reason: "Missing required fields." },
      { status: 400 }
    );
  }

  // Validate tier
  if (!['team', 'enterprise', 'credit-purchase'].includes(tier)) {
    return NextResponse.json(
      { ok: false, reason: "Invalid tier." },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, reason: "Invalid or expired session." },
      { status: 401 }
    );
  }
  const userId = userData.user.id;

  // Verify org membership
  const membershipClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: membership } = await membershipClient
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { ok: false, reason: "You are not an active member of that organization." },
      { status: 403 }
    );
  }

  // Generate case ID and assign persona
  const caseId = crypto.randomUUID();
  const personaName = assignPersonaForConversation(userId, caseId);

  // Create billing case in Supabase using service client (or write directly)
  // For now, use the authenticated client with proper typing
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: caseRecord, error: caseError } = await dbClient
    .from("billing_cases")
    .insert({
      id: caseId,
      user_id: userId,
      customer_name: customerName,
      billing_email: billingEmail,
      organization_id: organizationId,
      organization_name: organizationName,
      tier: tier as 'team' | 'enterprise' | 'credit-purchase',
      plan: plan || null,
      member_count: memberCount,
      normal_credit_amount: normalCreditAmountUsd || null,
      autonomous_ticket_amount: autonomousTicketAmountUsd || null,
      usd_total: amountUsd,
      inr_total: amountInr,
      gst_percent: gstPercent || null,
      assigned_persona: personaName,
      payment_status: 'pending',
      validation_status: 'awaiting_review',
    })
    .select()
    .single();

  if (caseError) {
    console.error('[create-billing-case] Insert error:', caseError);
    return NextResponse.json(
      { ok: false, reason: `Failed to create billing case: ${caseError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    caseId,
    personaName,
    amountInr,
  });
}
