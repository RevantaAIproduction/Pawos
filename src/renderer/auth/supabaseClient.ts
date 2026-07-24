import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ipc } from '../services/ipc/ipcBridgeImplementation';

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Lazily-initialized singleton — reads SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY
 * from .env via IPC (see src/main/env/readEnvFile.ts) the first time it's
 * needed, rather than requiring a rebuild to pick up new values. Only the
 * publishable/anon key is ever used here — it's designed to be public
 * (Supabase's Row Level Security policies enforce the actual access
 * control), never the secret/service-role key, which never leaves the
 * backend this app talks to.
 */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = ipc.envGetApiKeys().then(async ({ supabaseUrl, supabasePublishableKey }) => {
      if (!supabaseUrl || !supabasePublishableKey) {
        clientPromise = null; // let a future call retry once configured, instead of caching a permanent failure
        throw new Error('Supabase isn’t configured yet — add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to your .env.');
      }
      // flowType: 'pkce' is required for GitHub sign-in (GitHubAuthProvider.ts)
      // — its OAuth redirect must come back as a `?code=` query param that a
      // plain Node loopback server can read, not a `#access_token=` URL
      // fragment (which never reaches a server at all, only browser JS).
      const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { flowType: 'pkce' } });
      // Wait for the client's internal session restoration (from persisted
      // storage) to finish before handing it out. Without this, a caller
      // that queries a table immediately after the client is created (e.g.
      // OrganizationService.getMyOrganizations() on first mount) can race
      // ahead of the restored auth token — the request goes out
      // effectively unauthenticated, RLS returns zero rows, and real data
      // silently disappears behind an empty-state UI.
      await client.auth.getSession();
      return client;
    });
  }
  return clientPromise;
}
