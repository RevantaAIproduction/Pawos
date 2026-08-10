/**
 * Shared types for the Mobile Presence architecture:
 *
 *   Mobile Presence
 *   ├── Trusted Device Runtime   (TrustedDevice, DeviceCapabilities)
 *   ├── Pairing Runtime          (PairingSession)
 *   ├── Cross Device Runtime     (CrossDeviceEvent, CrossDeviceEventType)
 *   ├── Notification Runtime     (PushSubscriptionRecord, NotificationEventType)
 *   ├── Conversation Sync        (a Cross Device Runtime module — no separate types, reuses CrossDeviceEvent)
 *   └── Mobile Client
 *         └── PWA (Phase 1)      (device_type: 'pwa' below — the type is intentionally an open
 *                                  string, not a union, so a future native client never needs a
 *                                  schema/type change here)
 *
 * Backed by supabase/migrations/20260730000000_mobile_presence_phase1.sql — replaces the two
 * local-Electron-JSON pairing stores (src/main/pairing/PlatformPairingStore.ts,
 * src/main/communication/MobilePairingStore.ts), which cannot work for a real phone client since a
 * browser on a phone can never read a file in the desktop's userData folder.
 */

/**
 * What a trusted device advertises it can do — lets Notification Runtime / Cross Device Runtime
 * make delivery decisions (e.g. only send a push to a device with pushNotifications: true) without
 * hard-coding "is this a phone" anywhere. Every future client type (native app, another desktop,
 * etc.) declares its own honest capability set instead of the runtime guessing from device_type.
 */
export type DeviceCapabilities = {
  pushNotifications: boolean;
  voice: boolean;
  camera: boolean;
  microphone: boolean;
  biometrics: boolean;
  offlineSupport: boolean;
  backgroundSync: boolean;
};

export const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  pushNotifications: false,
  voice: false,
  camera: false,
  microphone: false,
  biometrics: false,
  offlineSupport: false,
  backgroundSync: false,
};

export type TrustedDeviceStatus = 'active' | 'revoked';

/** A row from `trusted_devices` — the Trusted Device Runtime's own record, replacing PairedDevice/PairedDeviceRecord. */
export type TrustedDevice = {
  id: string;
  userId: string;
  name: string;
  /** Open string on purpose — see file header. 'pwa' is the only value Phase 1 ever produces. */
  deviceType: string;
  platform: string | null;
  browser: string | null;
  capabilities: DeviceCapabilities;
  status: TrustedDeviceStatus;
  pairedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

/** A row from `pairing_sessions`, as read back by the desktop while waiting for completion — never includes the token itself (only begin_pairing_session()'s direct return value does). */
export type PairingSessionStatus = 'pending' | 'completed' | 'expired' | 'cancelled';

export type PairingSession = {
  id: string;
  status: PairingSessionStatus;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  resultingDeviceId: string | null;
};

/** The one-time return value of beginning a pairing session — `token` and `pairingUrl` exist only here; the server never returns the plaintext token again after this call. */
export type PairingSessionStart = {
  sessionId: string;
  token: string;
  /** A real https://<pawos-web host>/pair/<sessionId>?token=<token> URL — not the old fake pawos-pair:// URI, since the phone's own browser is the client that opens this. */
  pairingUrl: string;
  qrDataUrl: string;
  expiresAt: string;
};

/** A row from `device_push_subscriptions` — standard W3C Push API shape (endpoint + p256dh/auth keys). */
export type PushSubscriptionRecord = {
  id: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  createdAt: string;
};

/**
 * One entry in a live Supabase Realtime Presence set (Cross Device Runtime, MOB-6) — ephemeral,
 * never persisted to a table. `deviceId` matches a `trusted_devices.id` once a device has paired;
 * an unpaired session has no `trusted_devices` row and therefore never joins presence at all
 * (no fabricated "online" state for a device the account hasn't actually trusted).
 */
export type DevicePresenceMember = {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  lastSeenAt: string;
};

/** Notification Runtime (MOB-7) — the Web Push payload the desktop main process (real sender, see PushNotificationService.ts) and the PWA's service worker (real receiver, see pawos-web/public/sw.js) both agree on. */
export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
  eventType?: string;
};

export type PushSendResult = {
  delivered: boolean;
  /** true if the push service reported the subscription as gone (404/410) — caller should delete the row. */
  expired: boolean;
  error?: string;
};

/**
 * Every notification/sync concept the product vision names, in one closed union — Notification
 * Runtime and Cross Device Runtime both key off this rather than a free-form string, so a typo
 * can't silently create a notification type nothing ever handles.
 */
export type CrossDeviceEventType =
  | 'taskCompleted'
  | 'executionCompleted'
  | 'workflowCompleted'
  | 'approvalRequired'
  | 'meetingReminder'
  | 'plannerUpdate'
  | 'intelligenceUpdate'
  | 'securityAlert'
  | 'organizationAlert'
  | 'deploymentAlert'
  | 'billingAlert'
  | 'connectorAlert'
  | 'conversationMessage'
  | 'presenceUpdate'
  | 'desktopStatus'
  /** Published by complete_pairing_session() (Pairing Runtime) — the real-time signal the desktop's Cross Device Runtime subscription uses to show pairing success immediately, no polling. */
  | 'devicePaired'
  /** Published by revoke_trusted_device() (Trusted Device Runtime) — also the audit-log record of every revocation. */
  | 'deviceRevoked'
  /** Published by the phone's Approval Center (MOB-9) in response to an 'approvalRequired' event — payload carries {requestId, approved}. The desktop's Cross Device Runtime subscription forwards an approved/denied response into the same plain "yes"/"no" reply path ConversationRuntime already uses for a spoken or typed confirmation, so no new confirmation mechanism is introduced. */
  | 'approvalResponse';

/** A row from `cross_device_events` — the Cross Device Runtime's outbox. Every other runtime publishes into this shape rather than inventing its own delivery mechanism. */
export type CrossDeviceEvent = {
  id: string;
  userId: string | null;
  organizationId: string | null;
  eventType: CrossDeviceEventType;
  sourceRuntime: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deliveredAt: string | null;
};
