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
    clientPromise = ipc.envGetApiKeys().then(({ supabaseUrl, supabasePublishableKey }) => {
      if (!supabaseUrl || !supabasePublishableKey) {
        clientPromise = null; // let a future call retry once configured, instead of caching a permanent failure
        throw new Error('Supabase isn’t configured yet — add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to your .env.');
      }
      return createClient(supabaseUrl, supabasePublishableKey);
    });
  }
  return clientPromise;
}
