import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * GET /api/admin/users/:id
 * Returns details for a specific user including tier and organization memberships.
 * Requires valid Bearer token and admin authorization.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = params.id;

  // Validate UUID format
  if (!userId || typeof userId !== 'string' || userId.length !== 36) {
    return NextResponse.json({ ok: false, reason: "Invalid user ID." }, { status: 400 });
  }

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

  // Authorized — query user detail
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    // Fetch user record
    const { data: userData_fetched, error: userError_fetch } = await dbClient
      .from('users')
      .select('id, email, created_at')
      .eq('id', userId)
      .single();

    if (userError_fetch || !userData_fetched) {
      return NextResponse.json({ ok: false, reason: "User not found." }, { status: 404 });
    }

    // Fetch subscription tier
    const { data: subData } = await dbClient
      .from('subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .single();

    // Fetch organization memberships
    const { data: memberData } = await dbClient
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userId);

    // Fetch organization names
    const orgIds = (memberData || []).map((m) => m.organization_id);
    const { data: orgData } = orgIds.length > 0
      ? await dbClient.from('organizations').select('id, name')
      : { data: [] };

    return NextResponse.json({
      ok: true,
      data: {
        user: userData_fetched,
        tier: subData?.tier || 'none',
        organizations: (memberData || []).map((m) => ({
          id: m.organization_id,
          name: (orgData || []).find((o) => o.id === m.organization_id)?.name,
          role: m.role,
        })),
      },
    });
  } catch (error) {
    console.error('[admin/users/[id]] Error:', error);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve user detail." },
      { status: 500 }
    );
  }
}
