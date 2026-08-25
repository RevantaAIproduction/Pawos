import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * Internal PawOS admin API — strict authorization required.
 * Returns high-value billing cases for review.
 * Backend enforces authorization; frontend should not be trusted.
 */
export async function GET(request: Request) {
  // GET endpoint for listing cases
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Extract and validate auth header
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, reason: "Missing or invalid authorization." }, { status: 401 });
  }

  const accessToken = authHeader.slice(7);
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  }

  const userEmail = userData.user.email;

  // Enforce strict authorization — only exact email matches allowed
  if (!AUTHORIZED_ADMINS.includes(userEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Unauthorized." },
      { status: 403 }
    );
  }

  // Authorized — query real billing cases
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: cases, error: caseError } = await dbClient
    .from("billing_cases")
    .select("*")
    .order("created_at", { ascending: false });

  if (caseError) {
    console.error('[admin/cases] Query error:', caseError);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve billing cases." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    cases: cases || [],
    authorizedEmail: userEmail,
  });
}

export async function POST(request: Request) {
  // POST endpoint for case actions (approve/reject)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, reason: "Missing or invalid authorization." }, { status: 401 });
  }

  const accessToken = authHeader.slice(7);
  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user?.email) {
    return NextResponse.json({ ok: false, reason: "Invalid or expired session." }, { status: 401 });
  }

  const userEmail = userData.user.email;
  if (!AUTHORIZED_ADMINS.includes(userEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Unauthorized." },
      { status: 403 }
    );
  }

  // Authorized — process case action
  const action = body?.action as string | undefined; // "approve" | "reject"
  const caseId = body?.caseId as string | undefined;
  const reason = body?.reason as string | undefined;

  if (!action || !caseId) {
    return NextResponse.json({ ok: false, reason: "Missing required fields." }, { status: 400 });
  }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ ok: false, reason: "Invalid action." }, { status: 400 });
  }

  if (action === 'reject' && !reason) {
    return NextResponse.json({ ok: false, reason: "Rejection reason is required." }, { status: 400 });
  }

  // Update the case in Supabase
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const timestamp = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    reviewed_by_email: userEmail,
    reviewed_at: timestamp,
    decision: action === 'approve' ? 'approved' : 'rejected',
    validation_status: action === 'approve' ? 'approved' : 'rejected',
  };

  if (action === 'reject') {
    updateData.rejection_reason = reason;
  }

  const { error: updateError } = await dbClient
    .from("billing_cases")
    .update(updateData)
    .eq("id", caseId);

  if (updateError) {
    console.error('[admin/cases] Update error:', updateError);
    return NextResponse.json(
      { ok: false, reason: "Failed to update case." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    action,
    caseId,
    reviewer: userEmail,
    timestamp,
  });
}
