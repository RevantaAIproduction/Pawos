import { getSupabaseClient } from './supabaseClient';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { noteConnectivityAccountVerified, resetConnectivityBootstrap } from '../connectivity/useConnectivityBootstrap';

type SyncedSession = { access_token: string; user?: { id?: string } } | null;

/**
 * Keeps the main process told which session is signed in, so it can scope per-account local records
 * (Work History, file-change ledgers). Only the access token crosses IPC — main verifies it with
 * Supabase Auth itself and never takes an account id from here. Runs once at startup: the current
 * session, then every sign-in, token refresh and sign-out (null) — and again whenever the network
 * comes back, so an account that could not be verified offline is verified as soon as it can be.
 */
export function startAccountSessionSync(): void {
  void (async () => {
    try {
      const supabase = await getSupabaseClient();
      const send = (session: SyncedSession) => {
        const token = session?.access_token ?? null;
        // Signed out: main forgets this account's connector credentials, so the next sign-in
        // (even the same account, same app run) restores them again.
        if (!token) resetConnectivityBootstrap();
        void ipc
          .accountSetSession(token)
          .then((result) => {
            // Main verified this session's account: a connector restore that could not finish yet
            // (offline at startup) is retried for it — and only for it.
            const userId = session?.user?.id;
            if (token && result?.signedIn && userId) noteConnectivityAccountVerified(userId);
          })
          .catch(() => {
            // Main unreachable for a moment: the next auth event sends the session again.
          });
      };
      const { data } = await supabase.auth.getSession();
      send(data.session ?? null);
      supabase.auth.onAuthStateChange((_event, session) => send(session ?? null));
      if (typeof window !== 'undefined') {
        // Back online: offline at startup, main could not verify the session (and no auth event
        // follows until the next token refresh) — send it again now. Only a session we have: a
        // refresh failing again on a flaky network is not a sign-out (that arrives as its own event).
        window.addEventListener('online', () => {
          void supabase.auth
            .getSession()
            .then(({ data: current }) => {
              if (current.session) send(current.session);
            })
            .catch(() => {});
        });
      }
    } catch {
      // No Supabase configuration: main keeps "no account", so nothing per-account is shown or recorded.
    }
  })();
}
