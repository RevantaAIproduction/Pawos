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

  // The organization's tier, read from Supabase — never trusted from the caller.
  const orgResponse = await fetch(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}&select=tier`,
    { headers }
  );
  console.log('[verifyRealOrganizationTier] ORGANIZATION_QUERY: HTTP', orgResponse.status);
  if (!orgResponse.ok) {
    const errorBody = await orgResponse.text().catch(() => '');
    console.log('[verifyRealOrganizationTier] ORGANIZATION_ERROR:', errorBody.slice(0, 200));
    return { ok: false, reason: 'Could not verify organization tier.' };
  }
  const orgRows = (await orgResponse.json()) as Array<{ tier: string }>;
  const tier = orgRows[0]?.tier;
  if (tier !== 'go' && tier !== 'pro' && tier !== 'proMax' && tier !== 'team' && tier !== 'enterprise') {
    return { ok: false, reason: 'Organization has no recognized tier.' };
  }

  return { ok: true, tier };
}
