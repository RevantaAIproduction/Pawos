import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * GET /api/admin/users
 * Returns paginated list of all PawOS users (system-wide, not RLS-filtered).
 * Requires valid Bearer token and admin authorization.
 * Query parameters: limit (default 25), offset (default 0), search (email filter)
 *
 * Implementation note: auth.users is not readable by the authenticated role,
 * so this endpoint uses server-side privileged access (service-role equivalent).
 * The service-role credential exists only server-side and is never returned to the client.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, reason: "Admin API not configured." },
      { status: 503 }
    );
  }

  // Authenticate Bearer token (using anon client)
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

  // Admin authorized — query auth.users via privileged server-side client
  // Service-role key never leaves the server and is never returned to client
  const adminClient = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    let query = adminClient
      .from('auth.users')
      .select('id, email, created_at', { count: 'exact' });

    if (search) {
      query = query.ilike('email', `%${search}%`);
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('[admin/users] Query error:', error);
      return NextResponse.json(
        { ok: false, reason: "Failed to retrieve users." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        items: (data || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
        })),
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[admin/users] Error:', error);
    return NextResponse.json(
      { ok: false, reason: "Failed to retrieve users." },
      { status: 500 }
    );
  }
}
