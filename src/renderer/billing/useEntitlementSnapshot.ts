import { useEffect, useState } from 'react';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';

/**
 * The current EntitlementSnapshot, re-read whenever the main process announces an out-of-band
 * entitlement change (PawOS Build synced after sign-in, cleared on sign-out, or reaching its
 * expiry). Sections that previously fetched the snapshot once on mount would otherwise keep showing
 * the pre-sync tier.
 */
export function useEntitlementSnapshot(): EntitlementSnapshot | null {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      ipc
        .entitlementGetSnapshot()
        .then((next) => {
          if (alive) setSnapshot(next);
        })
        .catch((err) => console.error('[Entitlement] Failed to read entitlement snapshot:', err));
    };
    load();
    const unsubscribe = ipc.onEntitlementChanged(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return snapshot;
}
