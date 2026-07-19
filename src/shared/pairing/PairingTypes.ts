/**
 * Generic, platform-level device pairing — independent of the (frozen)
 * Communication Intelligence Runtime's own MobilePairingStore. Any future
 * mobile companion client (Communication Runtime's phone-call capture,
 * a notifications app, etc.) registers through this one shared registry
 * instead of each runtime inventing its own pairing mechanism.
 */
export type PairedDeviceStatus = 'active' | 'revoked';

export type PairedDevice = {
  deviceId: string;
  name: string;
  publicKey: string;
  /** The PawOS account this device is linked to, if the user was signed in when pairing completed — undefined for a guest session. */
  userId?: string;
  pairedAt: number;
  lastSeenAt: number;
  status: PairedDeviceStatus;
  revokedAt: number | null;
};

export type PairingSessionInfo = {
  token: string;
  /** Compact URI a mobile client's QR scanner decodes to recover the token — not a real deep link target, since no mobile client exists in this codebase yet. */
  pairingUri: string;
  qrDataUrl: string;
  expiresAt: number;
};
