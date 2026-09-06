import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * GET /api/admin/organizations/:id
 * Returns details for a specific organization including members and wallet.
 * Requires valid Bearer token and admin authorization.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const orgId = params.id;

  // Validate UUID format
  if (!orgId || typeof orgId !== 'string' || orgId.length !== 36) {
    return NextResponse.json({ ok: false, reason: "Invalid organization ID." }, { status: 400 });
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

  // Authorized — query organization detail
  const dbClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    // Fetch organization
    const { data: orgData, error: orgError } = await dbClient
      .from('organizations')
      .select('id, name, slug, tier, owner_id, seat_count, created_at')
      .eq('id', orgId)
      .single();

    if (orgError || !orgData) {
      return NextResponse.json({ ok: false, reason: "Organization not found." }, { status: 404 });
    }

    // Fetch members with user details
    const { data: memberData } = await dbClient
      .from('organization_members')
      .select('user_id, role, created_at')
      .eq('organization_id', orgId);

    const userIds = (memberData || []).map((m) => m.user_id);
    let usersMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: users } = await dbClient
        .from('users')
        .select('id, email')
        .in('id', userIds);

      if (users) {
        usersMap = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
      }
    }

    // Fetch wallet info if it exists
    const { data: walletData } = await dbClient
      .from('organization_wallets')
      .select('balance_credits, created_at')
      .eq('organization_id', orgId)
      .single();

    return NextResponse.json({
      ok: true,
      data: {
        organization: orgData,
        members: (memberData || []).map((m) => ({
          user_id: m.user_id,
          email: usersMap[m.user_id]?.email,
          role: m.role,
          created_at: m.created_at,
        })),
        wallet: walletData || { balance_credits: 0 },
      },
    });
  } catch (error) {
    console.error('[admin/organizations/[id]] Error:', error);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve organization detail." },
      { status: 500 }
    );
  }
}
