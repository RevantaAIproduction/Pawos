import QRCode from 'qrcode';
import { getSupabaseClient } from '../auth/supabaseClient';
import { crossDeviceRuntimeClient } from './CrossDeviceRuntimeClient';
import { syncEntitlementTier } from './EntitlementSyncProvider';
import type { PairingSessionStart } from '../../shared/mobilePresence/MobilePresenceTypes';

const SITE_URL = 'https://pawos.app';

type BeginPairingRow = { session_id: string; token: string; expires_at: string };

/**
 * Pairing Runtime — the desktop-side half of the QR pairing flow. The
 * phone-side half lives in pawos-web's /pair/[sessionId] route, which calls
 * `complete_pairing_session` directly against the same Supabase project.
 * Entitlement enforcement happens server-side inside `begin_pairing_session`
 * (see supabase/migrations/20260730020000_mobile_presence_pairing_enforcement.sql)
 * — this service does not duplicate that check, it only surfaces whatever
 * error Postgres raises.
 */
export const pairingService = {
  /** Self-reports the desktop's current entitlement snapshot before a pairing attempt — see EntitlementSyncProvider.ts for why this is temporary and must not be treated as a permanent trust source. */
  syncEntitlementTier,

  /** Starts a real pairing session. Lets a Go-tier rejection ("Mobile pairing requires Paw Pro or higher.") propagate untouched — callers are responsible for presenting that message, this never swallows or re-wraps it. */
  async beginPairing(): Promise<PairingSessionStart> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('begin_pairing_session', {}).single<BeginPairingRow>();
    if (error) throw error;
    if (!data) throw new Error('begin_pairing_session returned no session');

    const pairingUrl = `${SITE_URL}/pair/${data.session_id}?token=${data.token}`;
    const qrDataUrl = await QRCode.toDataURL(pairingUrl);

    return {
      sessionId: data.session_id,
      token: data.token,
      pairingUrl,
      qrDataUrl,
      expiresAt: data.expires_at,
    };
  },

  /** Cancels a pending session so its token is immediately unusable, distinct from just letting it expire. */
  async cancelPairing(sessionId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('cancel_pairing_session', { p_session_id: sessionId });
    if (error) throw error;
  },

  /**
   * Subscribes to this account's Cross Device Runtime stream and fires
   * `onPaired` the instant `complete_pairing_session` (running on the phone)
   * publishes a `devicePaired` event for this exact session — no polling.
   * Returns the unsubscribe function.
   */
  subscribeToPairingCompletion(sessionId: string, userId: string, onPaired: (deviceId: string) => void): () => void {
    return crossDeviceRuntimeClient.subscribeToEvents(userId, (event) => {
      if (event.eventType !== 'devicePaired') return;
      if (event.payload.sessionId !== sessionId) return;
      const deviceId = event.payload.deviceId;
      if (typeof deviceId === 'string') onPaired(deviceId);
    });
  },
};
