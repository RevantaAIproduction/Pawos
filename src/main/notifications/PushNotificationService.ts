import webpush from 'web-push';
import type { PushNotificationPayload, PushSendResult } from '../../shared/mobilePresence/MobilePresenceTypes';

export type { PushNotificationPayload, PushSendResult };

let configured = false;

/** Reads VAPID_* from process.env lazily (not at module load) so `.env` file values already merged into process.env by main.ts's startup sequence are picked up, rather than racing module import order. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@pawos.app', publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Notification Runtime (MOB-7) — the desktop-side Web Push sender. Sending a
 * push is just an outbound HTTPS request signed with the VAPID keypair (no
 * inbound server needed), so this runs directly in the Electron main
 * process — the same process that knows when a task/execution/deployment
 * etc. actually completed. Honest limitation: this means dispatch only
 * happens while the desktop app is running; there is no separate always-on
 * server in this project yet to dispatch pushes when it's closed (consistent
 * with every other "no persistent backend yet" gap already disclosed
 * elsewhere in Mobile Presence).
 */
export const pushNotificationService = {
  isConfigured(): boolean {
    return ensureConfigured();
  },

  async send(
    subscription: { endpoint: string; p256dh: string; authKey: string },
    payload: PushNotificationPayload
  ): Promise<PushSendResult> {
    if (!ensureConfigured()) {
      return { delivered: false, expired: false, error: 'Push notifications are not configured on this desktop install (missing VAPID keys).' };
    }
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.authKey } },
        JSON.stringify(payload)
      );
      return { delivered: true, expired: false };
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      const expired = statusCode === 404 || statusCode === 410;
      return { delivered: false, expired, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
