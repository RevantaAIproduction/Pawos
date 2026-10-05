import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * "Continue with browser" — signing PawOS Desktop in with the account already signed in on PawOS Web,
 * so someone who signed up or logged in on the website doesn't have to sign in again in the app.
 *
 * The flow is PKCE-shaped, so nothing that travels through the browser can be used on its own:
 *  1. PawOS Desktop keeps a random verifier in its main process and opens
 *     /auth/desktop?challenge=<base64url(sha256(verifier))>.
 *  2. The signed-in person confirms on that page. The server mints a one-time sign-in token for
 *     their account (Supabase admin generateLink — no email is sent) and stores it here under a
 *     random code, bound to the challenge, for TTL_MS.
 *  3. The browser hands only the code to the app (pawos://web-auth-callback?code=…).
 *  4. The app trades code + verifier at /api/auth/desktop/consume for the token, once, and
 *     verifies it with Supabase (verifyOtp) — a session of its own, not a copy of the browser's.
 *
 * In-memory, like googleAuthRelayStore.ts: this server is a single long-lived `next start` process.
 */

export const DESKTOP_SIGN_IN_TTL_MS = 120_000;
export const DESKTOP_SIGN_IN_PROTOCOL_URL = "pawos://web-auth-callback";

const BASE64URL_SHA256 = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/;

export function isValidChallenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && BASE64URL_SHA256.test(challenge);
}

export function challengeForVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

interface Entry {
  tokenHash: string;
  email: string;
  challenge: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();

function sweepExpired(now: number): void {
  for (const [code, entry] of store) if (entry.expiresAt <= now) store.delete(code);
}

export function stashDesktopSignIn(entry: { tokenHash: string; email: string; challenge: string }, now = Date.now()): string {
  sweepExpired(now);
  const code = randomBytes(32).toString("base64url");
  store.set(code, { ...entry, expiresAt: now + DESKTOP_SIGN_IN_TTL_MS });
  return code;
}

/**
 * Single-use: the code is deleted on the first attempt, whether or not the verifier matches, so a
 * guessed or intercepted code can't be retried.
 */
export function consumeDesktopSignIn(code: unknown, verifier: unknown, now = Date.now()): { tokenHash: string; email: string } | null {
  if (typeof code !== "string" || typeof verifier !== "string" || !VERIFIER.test(verifier)) return null;
  const entry = store.get(code);
  store.delete(code);
  if (!entry || entry.expiresAt <= now) return null;
  const expected = Buffer.from(entry.challenge);
  const actual = Buffer.from(challengeForVerifier(verifier));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { tokenHash: entry.tokenHash, email: entry.email };
}

/** The page that starts it, with the challenge — also where /login sends the browser back to. */
export function desktopSignInPath(challenge: string): string {
  return `/auth/desktop?challenge=${encodeURIComponent(challenge)}`;
}
