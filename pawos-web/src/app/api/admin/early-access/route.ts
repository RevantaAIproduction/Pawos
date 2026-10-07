import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { isPawosAdmin } from "../../../../lib/admin/isPawosAdmin";

/**
 * GET /api/admin/early-access
 * Returns every Early Access registration, newest first, for the /admin/early-access list view.
 * Requires valid Bearer token and admin authorization (same check as ../cases and ../overview).
 * Read-only — there is deliberately no mutation endpoint here.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured." }, { status: 503 });
  }

  // Authenticate Bearer token
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

  // Enforce admin authorization
  if (!(await isPawosAdmin(accessToken))) {
    return NextResponse.json({ ok: false, reason: "Unauthorized." }, { status: 403 });
  }

  // Admin authorized — the table has RLS with no policies, so only the service role can read it.
  // The key never leaves this server.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, reason: "Admin API not fully configured." }, { status: 503 });
  }

  const adminClient = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: registrations, error } = await adminClient
    .from("early_access_registrations")
    .select("id, name, email, role, company, github_profile, selected_workflows, custom_use_case, source, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/early-access] Query error:", error);
    return NextResponse.json({ ok: false, reason: "Failed to retrieve Early Access registrations." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    registrations: registrations || [],
    authorizedEmail: userEmail,
  });
}
