import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * GET /api/admin/organizations
 * Returns paginated list of organizations with optional search filter.
 * Requires valid Bearer token and admin authorization.
 * Query parameters: limit (default 25), offset (default 0), search (name filter)
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

  // Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
  const search = (searchParams.get('search') || '').trim().slice(0, 255);

  if (limit < 1 || limit > 100 || offset < 0 || offset > 1000000) {
    return NextResponse.json(
      { ok: false, reason: "Invalid pagination parameters." },
      { status: 400 }
    );
  }

  // Admin authorized — query all organizations (system-wide, not RLS-filtered)
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
    let query = adminClient
      .from('organizations')
      .select('id, name, slug, tier, owner_id, seat_count, created_at', { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('[admin/organizations] Query error:', error);
      return NextResponse.json(
        { ok: false, reason: "Failed to retrieve organizations." },
        { status: 500 }
      );
    }

    // Get member counts for returned organizations
    const orgIds = (data || []).map((o) => o.id);
    let memberCountsMap: Record<string, number> = {};

    if (orgIds.length > 0) {
      const { data: memberCounts, error: countError } = await adminClient
        .from('organization_members')
        .select('organization_id');

      if (!countError && memberCounts) {
        memberCountsMap = memberCounts.reduce((acc: Record<string, number>, m: any) => {
          acc[m.organization_id] = (acc[m.organization_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: (data || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          tier: o.tier,
          owner_id: o.owner_id,
          seat_count: o.seat_count,
          member_count: memberCountsMap[o.id] || 0,
          created_at: o.created_at,
        })),
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[admin/organizations] Error:', error);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve organizations." },
      { status: 500 }
    );
  }
}
