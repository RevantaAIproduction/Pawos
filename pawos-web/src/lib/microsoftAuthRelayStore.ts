/**
 * Short-lived, single-use handoff store for the Microsoft sign-in relay (see desktopRelay.ts's
 * relayMicrosoftToDesktop). Identical pattern to googleAuthRelayStore.ts — the desktop receives
 * only a short, random, single-use `ref`, and fetches the actual token/profile payload via
 * /api/auth/microsoft/consume?ref=... immediately after receiving the relay redirect.
 */

export interface MicrosoftAuthPayload {
  idToken: string;
  accessToken: string;
  profile: { id: string; mail: string; displayName?: string };
}

const TTL_MS = 120_000; // matches MicrosoftOAuthFlow.ts's own 120s pending-sign-in timeout

interface Entry {
  payload: MicrosoftAuthPayload;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [ref, entry] of store) {
    if (entry.expiresAt <= now) store.delete(ref);
  }
}

export function stashMicrosoftAuthPayload(payload: MicrosoftAuthPayload): string {
  sweepExpired();
  const ref = crypto.randomUUID();
  store.set(ref, { payload, expiresAt: Date.now() + TTL_MS });
  return ref;
}

/** Single-use: deletes the entry as part of reading it, regardless of whether it was expired. */
export function consumeMicrosoftAuthPayload(ref: string): MicrosoftAuthPayload | undefined {
  const entry = store.get(ref);
  store.delete(ref);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.payload;
}
