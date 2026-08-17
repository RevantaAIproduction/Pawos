import { useEffect } from 'react';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { organizationService } from './OrganizationService';
import { getSupabaseClient } from '../auth/supabaseClient';

let syncedForUserId: string | null = null;

/**
 * Re-syncs the local per-device subscription tier from the user's real organization membership as
 * soon as a signed-in session exists — mirroring OrganizationSection.tsx's own resync effect, but
 * triggered at the app root instead of waiting for the user to open Settings -> Account.
 *
 * Without this, a Team/Enterprise org member who goes straight to Settings -> Devices (or the
 * first-run onboarding wizard) to pair a phone never visits Settings -> Account, so the local
 * SubscriptionStore never learns about their organization membership and stays at its default
 * 'go' tier -- which begin_pairing_session() then correctly (per its own narrow logic) rejects.
 * Module-level dedup means this and OrganizationSection's own effect never double-sync within one
 * signed-in session; each simply becomes a no-op once the other has already resolved a tier.
 */
export function useOrganizationTierSync(userId: string | undefined, isGuest: boolean): void {
  useEffect(() => {
    if (isGuest || !userId) return;
    if (syncedForUserId === userId) return;
    syncedForUserId = userId;

    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
        if (cancelled) return;
        try {
          const orgs = await organizationService.getMyOrganizations();
          const mine = orgs[0] ?? null;
          if (mine) {
            // P0-3 security fix: the main process independently re-verifies real, active membership
            // and the organization's real tier against Supabase using this token — mine.tier is never
            // trusted directly. See OrganizationTierVerification.ts.
            const supabase = await getSupabaseClient();
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (accessToken) {
              await ipc.billingSyncTierFromOrganization(accessToken, mine.id);
            }
            return;
          }
        } catch {
          // Best-effort: no organization yet, or the Supabase session isn't fully live this early
          // in app startup -- OrganizationSection's own effect (with its own retry loop) still
          // covers this case if/when the user opens Settings -> Account.
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, isGuest]);
}
