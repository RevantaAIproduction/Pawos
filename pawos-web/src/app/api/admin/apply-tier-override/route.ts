import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient as createServiceClient } from "../../../../lib/supabase/server-admin";

const AUTHORIZED_ADMINS = [
  "founder@revantaai.com",
  "pawos@revantaai.com",
  "tharun@revantaai.com",
];

/**
 * Admin-only endpoint to apply a test-tier override.
 * Combines user lookup + override application in one secure operation.
 *
 * Authorization: Bearer token required (PawOS authenticated user)
 * Caller must be in AUTHORIZED_ADMINS
 *
 * Body: { targetEmail: string, tier: "proMax" | "pro" | "go" | "team" | "enterprise" }
 *
 * Safety:
 * - Does NOT create Razorpay payments/orders
 * - Does NOT modify wallet/credit balances
 * - Does NOT create fake subscriptions
 * - Uses existing admin_test_tier_overrides table with RLS
 * - Logs all operations to admin_test_tier_audit
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, reason: "Supabase not configured" },
      { status: 503 }
    );
  }

  // 1. Authenticate via Bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, reason: "Missing or invalid authorization" },
      { status: 401 }
    );
  }

  const accessToken = authHeader.slice(7);
  const authClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(
    accessToken
  );

  if (userError || !userData.user?.email) {
    return NextResponse.json(
      { ok: false, reason: "Invalid or expired session" },
      { status: 401 }
    );
  }

  const adminEmail = userData.user.email;
  const adminId = userData.user.id;

  // 2. Verify admin authorization
  if (!AUTHORIZED_ADMINS.includes(adminEmail)) {
    return NextResponse.json(
      { ok: false, reason: "Unauthorized" },
      { status: 403 }
    );
  }

  // 3. Parse request
  const body = await request.json().catch(() => null);
  const targetEmail = (body?.targetEmail as string)
    ?.toLowerCase()
    .trim();
  const tier = body?.tier as string;

  if (!targetEmail || !tier) {
    return NextResponse.json(
      { ok: false, reason: "targetEmail and tier required" },
      { status: 400 }
    );
  }

  if (!["go", "pro", "proMax", "team", "enterprise"].includes(tier)) {
    return NextResponse.json(
      { ok: false, reason: "Invalid tier" },
      { status: 400 }
    );
  }

  try {
    // 4. Resolve target user via service role
    const serviceClient = createServiceClient();
    const { data: users, error: usersError } =
      await serviceClient.auth.admin.listUsers();

    if (usersError) {
      console.error("[apply-tier-override] User lookup error:", usersError);
      return NextResponse.json(
        { ok: false, reason: "Failed to resolve user" },
        { status: 500 }
      );
    }

    const targetUser = users?.users?.find(
      (u) => u.email?.toLowerCase() === targetEmail
    );

    if (!targetUser) {
      return NextResponse.json(
        { ok: false, reason: `User not found: ${targetEmail}` },
        { status: 404 }
      );
    }

    const targetUserId = targetUser.id;

    // 5. Get current tier from user_entitlements for "real tier" tracking
    const dbClient = createSupabaseClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: entitlements, error: entError } = await dbClient
      .from("user_entitlements")
      .select("tier")
      .eq("user_id", targetUserId)
      .single();

    const realTier = entitlements?.tier || "go";

    // 6. Upsert admin test tier override
    const { error: overrideError } = await dbClient
      .from("admin_test_tier_overrides")
      .upsert(
        {
          user_id: targetUserId,
          organization_id: null,
          real_tier: realTier,
          override_tier: tier,
          applied_by: adminEmail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,organization_id" }
      );

    if (overrideError) {
      console.error(
        "[apply-tier-override] Override upsert error:",
        overrideError
      );
      return NextResponse.json(
        { ok: false, reason: "Failed to apply override" },
        { status: 500 }
      );
    }

    // 7. Log to audit trail
    const { error: auditError } = await dbClient
      .from("admin_test_tier_audit")
      .insert({
        user_id: targetUserId,
        organization_id: null,
        administrator_id: adminId,
        administrator_email: adminEmail,
        action: "apply",
        previous_tier: realTier,
        new_tier: tier,
      });

    if (auditError) {
      console.error("[apply-tier-override] Audit log error:", auditError);
      // Non-fatal: override was applied even if audit failed
    }

    console.log(
      `[apply-tier-override] Admin ${adminEmail} applied ${tier} override to ${targetEmail} (real tier: ${realTier})`
    );

    const maskUUID = (uuid: string) =>
      uuid.substring(0, 8) +
      "-xxxx-xxxx-xxxx-" +
      uuid.substring(uuid.length - 4);

    return NextResponse.json({
      ok: true,
      targetEmail: targetUser.email,
      targetUUID_masked: maskUUID(targetUserId),
      realTier,
      overrideTier: tier,
      appliedBy: adminEmail,
      appliedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[apply-tier-override] Exception:", error);
    return NextResponse.json(
      { ok: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
