import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * GET: List member credit requests (org members can view own, admins see all)
 * POST: Member requests additional credits
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken || !organizationId) {
    return NextResponse.json({ ok: false, reason: "Missing parameters." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData } = await client.auth.getUser(accessToken);
    if (!userData.user) {
      return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 401 });
    }

    // Fetch requests (RLS restricts visibility)
    const { data: requests, error } = await client
      .from("member_credit_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, reason: "Failed to fetch requests." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, requests });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { organizationId, requestedAmount, reason } = body;
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken || !organizationId || !requestedAmount || requestedAmount <= 0) {
    return NextResponse.json({ ok: false, reason: "Invalid request." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  try {
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData } = await client.auth.getUser(accessToken);
    if (!userData.user) {
      return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 401 });
    }

    // Verify user is member of organization
    const { data: membership } = await client
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, reason: "Not an organization member." }, { status: 403 });
    }

    // Create request
    const { data: newRequest, error } = await client
      .from("member_credit_requests")
      .insert({
        organization_id: organizationId,
        requesting_user_id: userData.user.id,
        requested_amount: requestedAmount,
        reason: reason || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, reason: "Failed to create request." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, request: newRequest });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}
