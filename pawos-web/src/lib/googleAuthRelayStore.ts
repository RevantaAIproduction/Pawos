/**
 * Short-lived, single-use handoff store for the Google sign-in relay (see desktopRelay.ts's
 * relayGoogleToDesktop). The pawos:// deep link that hands control back to Electron cannot carry
 * the finished id_token/access_token directly — real Google tokens are commonly 1000+ characters
 * each, and a `pawos://google-auth-callback?id_token=...&access_token=...` URL built from them
 * (confirmed live: ~2400+ characters) is silently dropped somewhere in the Windows → Electron
 * protocol-handoff chain, while a short URL (a few hundred characters) goes through reliably. So
 * the deep link now carries only a short, random, single-use `ref` — the actual token/profile
 * payload is stashed here server-side and Electron fetches it once via GET
 * /api/auth/google/consume?ref=... immediately after receiving the deep link.
 *
 * In-memory only: this server runs as a single long-lived Node process (confirmed via its own
 * `Server: nginx` reverse proxy in front of a persistent `next start`, not a serverless/edge
 * deployment), so a plain Map survives the few seconds between "redirect the browser" and
 * "Electron fetches it" without needing real persistence. A ref is deleted the instant it's read
 * (or after TTL_MS, whichever comes first) — it is never valid to read twice.
 */

export interface GoogleAuthPayload {
  idToken: string;
  accessToken: string;
  profile: { sub: string; email: string; name?: string; picture?: string };
}

const TTL_MS = 120_000; // matches GoogleOAuthFlow.ts's own 120s pending-sign-in timeout

interface Entry {
  payload: GoogleAuthPayload;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [ref, entry] of store) {
    if (entry.expiresAt <= now) store.delete(ref);
  }
}

export function stashGoogleAuthPayload(payload: GoogleAuthPayload): string {
  sweepExpired();
  const ref = crypto.randomUUID();
  store.set(ref, { payload, expiresAt: Date.now() + TTL_MS });
  return ref;
}

/** Single-use: deletes the entry as part of reading it, regardless of whether it was expired. */
export function consumeGoogleAuthPayload(ref: string): GoogleAuthPayload | undefined {
  const entry = store.get(ref);
  store.delete(ref);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.payload;
}
