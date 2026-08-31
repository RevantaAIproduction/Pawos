/**
 * Mobile Authentication & Pairing Types — shared between Desktop and Mobile
 * for the Security Key verification flow (Phase 2).
 */

export type PairingState =
  | 'auth' // Desktop: awaiting web authorization
  | 'qr' // Desktop: QR generated, waiting for mobile scan
  | 'qr_verified' // Mobile: QR scanned successfully, waiting for Security Key
  | 'key_entry' // Mobile: showing Security Key input field
  | 'key_verified' // Desktop + Mobile: Security Key verified, device trusted
  | 'trusted' // Final state: persistent connection established
  | 'error'; // Any step failed

export type SecurityKeyChallenge = {
  plaintext: string; // e.g., "7K4P-92MX" — ephemeral only, never persisted
  expiresAt: string; // ISO 8601 timestamp
  sessionId: string; // Tied to pairing session
  maxAttempts: number; // Usually 5
};

export type SecurityKeyVerificationRequest = {
  sessionId: string;
  keyPlain: string; // User-entered key from mobile
};

export type SecurityKeyVerificationResult = {
  success: boolean;
  deviceId?: string; // UUID of trusted device
  sessionToken?: string; // Persistent credential for mobile to store
  expiresAt?: string; // Session token expiration
  error?: string; // Human-readable error message
};

export type MobileSessionToken = {
  sessionToken: string;
  deviceId: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

/**
 * Web Authorization code — exchanged for auth confirmation
 * (short-lived, single-use, bound to session).
 */
export type WebAuthorizationCode = {
  code: string; // Random UUID or token
  expiresAt: string; // ISO 8601
  sessionId: string; // Desktop pairing session
  deviceId: string; // Desktop device UUID
};

/**
 * Result of web authorization (returned via electron:// redirect).
 * Never includes long-lived credentials.
 */
export type WebAuthorizationResult = {
  success: boolean;
  userId?: string; // Confirmed user ID
  sessionId?: string; // Pairing session ID
  accountName?: string; // For display: "user@example.com"
  error?: string;
};
