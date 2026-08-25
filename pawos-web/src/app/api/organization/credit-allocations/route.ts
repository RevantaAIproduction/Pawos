import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * GET: List member allocations
 * POST: Admin approves request and allocates credits
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

    const { data: allocations, error } = await client
      .from("member_credit_allocations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, reason: "Failed to fetch allocations." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, allocations });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { organizationId, requestId, memberId, allocateAmount, approve } = body;
  const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!accessToken || !organizationId || !memberId || allocateAmount === undefined) {
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

    // Verify user is admin
    const { data: membership } = await client
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      return NextResponse.json({ ok: false, reason: "Not an admin." }, { status: 403 });
    }

    // Update request status if requestId provided (approval/rejection flow)
    if (requestId) {
      const { error: updateReqError } = await client
        .from("member_credit_requests")
        .update({
          status: approve ? "approved" : "rejected",
          approved_by: approve ? userData.user.id : null,
          allocated_amount: approve ? allocateAmount : null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("organization_id", organizationId);

      if (updateReqError) {
        return NextResponse.json({ ok: false, reason: "Failed to update request." }, { status: 500 });
      }
    }

    // Update member allocation (works for both request approval and manual allocation)
    if (approve) {
      const { error: allocError } = await client
        .from("member_credit_allocations")
        .upsert({
          organization_id: organizationId,
          member_user_id: memberId,
          allocated_credits: allocateAmount,
        })
        .select()
        .single();

      if (allocError) {
        return NextResponse.json({ ok: false, reason: "Failed to allocate credits." }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      message: approve ? "Credits allocated." : "Request rejected.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, reason: error instanceof Error ? error.message : "Error." },
      { status: 500 }
    );
  }
}
