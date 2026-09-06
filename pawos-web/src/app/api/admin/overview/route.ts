import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * GET /api/admin/overview
 * Returns admin dashboard metrics: user count, organization count, active runs, recent billing events.
 * Requires valid Bearer token and admin authorization.
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
  if (!AUTHORIZED_ADMINS.includes(userEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Unauthorized." },
      { status: 403 }
    );
  }

  // Admin authorized — query system-wide metrics
  // Uses service-role for system-wide visibility; key never returned to client
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, reason: "Admin API not fully configured." },
      { status: 503 }
    );
  }

  const adminClient = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Get user count - from auth.users (system-wide, requires service-role)
    const { count: userCount, error: usersError } = await adminClient
      .from('auth.users')
      .select('*', { count: 'exact', head: true })
      .limit(0);

    if (usersError) {
      console.error('[admin/overview] Users count error:', usersError);
      return NextResponse.json(
        { ok: false, reason: "Failed to count users." },
        { status: 500 }
      );
    }

    // Get organization count (system-wide)
    const { count: orgCount, error: orgsError } = await adminClient
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .limit(0);

    if (orgsError) {
      console.error('[admin/overview] Organizations count error:', orgsError);
      return NextResponse.json(
        { ok: false, reason: "Failed to count organizations." },
        { status: 500 }
      );
    }

    // Get active runs count (system-wide)
    const { count: activeRunsCount, error: runsError } = await adminClient
      .from('autonomous_task_runs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['queued', 'running', 'waiting_for_permission', 'blocked', 'waiting_for_topup'])
      .limit(0);

    if (runsError) {
      console.error('[admin/overview] Active runs count error:', runsError);
      return NextResponse.json(
        { ok: false, reason: "Failed to count active runs." },
        { status: 500 }
      );
    }

    // Get recent billing events count (last 30 days, system-wide)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: billingEventsCount, error: billingError } = await adminClient
      .from('organization_billing_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
      .limit(0);

    if (billingError) {
      console.error('[admin/overview] Billing events count error:', billingError);
      return NextResponse.json(
        { ok: false, reason: "Failed to count billing events." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        totalUsers: userCount || 0,
        totalOrganizations: orgCount || 0,
        activeRuns: activeRunsCount || 0,
        recentBillingEvents: billingEventsCount || 0,
      },
    });
  } catch (error) {
    console.error('[admin/overview] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve overview data." },
      { status: 500 }
    );
  }
}
