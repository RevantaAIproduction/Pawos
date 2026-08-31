import type { SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * P0-3 security fix. billing:syncFromOrganization previously trusted an `orgTier` argument supplied
 * directly by the renderer with zero verification — any code running in the renderer (including a
 * script in devtools) could call it with `orgTier: 'enterprise'` and instantly elevate the local
 * subscription to Enterprise, since SubscriptionStore.syncFromOrganization() sets
 * `status: 'active'` whenever the requested tier is higher than the current one. See the production
 * audit finding this closes.
 *
 * This function makes the main process independently verify, against Supabase itself, that the
 * calling user is really an active member of the claimed organization and that the organization's
 * own `tier` column really matches — using the caller's OWN access token (so the query runs under
 * their real identity, respecting RLS) rather than trusting anything the renderer merely asserts.
 */
export async function verifyRealOrganizationTier(
  accessToken: string,
  organizationId: string
): Promise<{ ok: true; tier: SubscriptionTierId } | { ok: false; reason: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // Safe diagnostic logging
  console.log('[verifyRealOrganizationTier] SUPABASE_URL:', supabaseUrl ? 'CONFIGURED' : 'MISSING');
  console.log('[verifyRealOrganizationTier] SUPABASE_PUBLISHABLE_KEY:', anonKey ? 'CONFIGURED' : 'MISSING');
  console.log('[verifyRealOrganizationTier] ACCESS_TOKEN:', accessToken ? 'PRESENT' : 'MISSING');
  console.log('[verifyRealOrganizationTier] ORGANIZATION_ID:', organizationId ? 'PRESENT' : 'MISSING');

  if (!supabaseUrl || !anonKey) {
    return { ok: false, reason: 'Supabase is not configured.' };
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // Real, active membership — RLS-scoped by the caller's own token, so this can only ever return a
  // row for organizations this specific user genuinely belongs to.
  const memberResponse = await fetch(
    `${supabaseUrl}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=id`,
    { headers }
  );
  console.log('[verifyRealOrganizationTier] MEMBERSHIP_CHECK: HTTP', memberResponse.status);
  if (!memberResponse.ok) {
    const errorBody = await memberResponse.text().catch(() => '');
    console.log('[verifyRealOrganizationTier] MEMBERSHIP_ERROR:', errorBody.slice(0, 200));
    return { ok: false, reason: 'Could not verify organization membership.' };
  }
  const memberRows = (await memberResponse.json()) as unknown[];
  if (!Array.isArray(memberRows) || memberRows.length === 0) {
    console.log('[verifyRealOrganizationTier] NOT_A_MEMBER');
    return { ok: false, reason: 'You are not an active member of that organization.' };
  }
  console.log('[verifyRealOrganizationTier] MEMBERSHIP_VERIFIED');

  // The organization's OWN tier and seat_count, read from Supabase — never trusted from the caller.
  const orgResponse = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}&select=tier,seat_count`,
    { headers }
  );
  console.log('[verifyRealOrganizationTier] ORGANIZATION_QUERY: HTTP', orgResponse.status);
  if (!orgResponse.ok) {
    const errorBody = await orgResponse.text().catch(() => '');
    console.log('[verifyRealOrganizationTier] ORGANIZATION_ERROR:', errorBody.slice(0, 200));
    return { ok: false, reason: 'Could not verify organization tier.' };
  }
  const orgRows = (await orgResponse.json()) as Array<{ tier: string; seat_count: number | null }>;
  const tier = orgRows[0]?.tier;
  if (tier !== 'team' && tier !== 'enterprise') {
    return { ok: false, reason: 'Organization has no recognized tier.' };
  }

  // Seat-limit enforcement: if the org has a configured seat_count, verify that the number of
  // active members does not exceed it. A null seat_count means no limit has been configured yet
  // (pre-seat-billing orgs) — skip the check in that case. This uses the caller's OWN token so
  // the count is RLS-scoped to members of this org (they can only count rows they're allowed to
  // see — i.e., members of their own org).
  const seatCount = typeof orgRows[0]?.seat_count === 'number' ? orgRows[0].seat_count : null;
  if (seatCount !== null && seatCount > 0) {
    const activeMembersResponse = await fetch(
      `${supabaseUrl}/rest/v1/organization_members?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=id`,
      { headers }
    );
    if (activeMembersResponse.ok) {
      const activeMemberRows = (await activeMembersResponse.json()) as unknown[];
      if (Array.isArray(activeMemberRows) && activeMemberRows.length > seatCount) {
        return {
          ok: false,
          reason: `Your organization has used all ${seatCount} purchased seats. Ask your billing admin to add a seat before signing in with this account.`,
        };
      }
    }
  }

  return { ok: true, tier };
}
