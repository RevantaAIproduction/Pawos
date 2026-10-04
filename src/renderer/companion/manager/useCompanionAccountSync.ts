import { useEffect } from 'react';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { companionProfileStore } from './CompanionProfileStore';
import { CompanionAccountSync, type AccountCompanion, type CompanionAccountBackend } from './CompanionAccountSync';

function toAccountCompanion(data: unknown): AccountCompanion {
  const row = (data ?? {}) as Record<string, unknown>;
  if (typeof row.companionUpdatedAt !== 'string') throw new Error('Unexpected account profile response.');
  return {
    companionId: typeof row.companionId === 'string' ? row.companionId : null,
    customCompanionName: typeof row.customCompanionName === 'string' ? row.customCompanionName : null,
    companionUpdatedAt: row.companionUpdatedAt,
  };
}

/** The account's Companion record, through the signed-in user's own Supabase session. */
const supabaseCompanionBackend: CompanionAccountBackend = {
  async get() {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('get_my_account_profile');
    if (error) throw error;
    return toAccountCompanion(data);
  },
  async set(selection) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('set_my_companion', { p_companion_id: selection.companionId, p_custom_name: selection.customName });
    if (error) throw error;
    return toAccountCompanion(data);
  },
};

const MIN_REFOCUS_SYNC_INTERVAL_MS = 60_000;

/**
 * Runs Companion account sync for the signed-in user: once on mount, whenever the local Companion
 * changes, when connectivity returns, and (at most once a minute) when the window regains focus —
 * which is how a change made on PawOS Web shows up here without a restart. Mount once, in the main
 * dashboard window, next to useConnectivityBootstrap.
 */
export function useCompanionAccountSync(userId: string): void {
  useEffect(() => {
    const sync = new CompanionAccountSync(userId, companionProfileStore, supabaseCompanionBackend, window.localStorage);
    const stop = sync.start();
    let lastFocusSync = Date.now();
    const onOnline = () => void sync.syncNow();
    const onFocus = () => {
      if (Date.now() - lastFocusSync < MIN_REFOCUS_SYNC_INTERVAL_MS) return;
      lastFocusSync = Date.now();
      void sync.syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);
}
