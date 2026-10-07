import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseClient as createAdminClient } from "../supabase/server-admin";

/**
 * Signing a PawOS client that isn't a browser (the PawOS CLI, the VS Code extension) in to the same
 * PawOS account, without that client ever seeing a password or a provider token:
 *
 *   client   makes a secret (the verifier) and gives the user the address of /auth/device, which
 *            carries the secret's SHA-256 (the challenge);
 *   browser  the user signs in to PawOS the way they always do (Google, GitHub, or email) and
 *            clicks Authorize; PawOS shows a completion address carrying a one-time handoff;
 *   client   the user pastes that address; the client sends the handoff with its verifier to
 *            /api/auth/device/exchange and receives its own session for that account.
 *
 * The handoff is short-lived, single-use, tied to the sign-in request it was issued for and to the
 * kind of client that asked, and useless without that client's verifier. It names a pending
 * sign-in — it is not, and does not contain, a session, a token or any key.
 *
 * Handoffs are kept in memory only: this server is one long-lived Node process (see
 * googleAuthRelayStore.ts), and a handoff lives for a few minutes at most. Nothing here logs one.
 */

export const DEVICE_HANDOFF_TTL_MS = 5 * 60 * 1000;
/** How long an expired handoff is remembered, only so the client can be told "expired" rather than "invalid". */
const EXPIRED_MEMORY_MS = 10 * 60 * 1000;
const MAX_HANDOFFS_PER_USER = 5;
const MAX_HANDOFFS = 10_000;
const EXCHANGE_ATTEMPTS_PER_MINUTE = 10;

export const DEVICE_CLIENTS = ["cli", "vscode"] as const;
export type DeviceClient = (typeof DEVICE_CLIENTS)[number];
export const DEVICE_CLIENT_LABELS: Record<DeviceClient, string> = { cli: "PawOS CLI", vscode: "PawOS for VS Code" };

/** base64url SHA-256: 43 characters. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 code verifier. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
/** 32 random bytes, base64url: 43 characters. */
const HANDOFF = /^[A-Za-z0-9_-]{43}$/;

export function isDeviceClient(value: unknown): value is DeviceClient {
  return typeof value === "string" && (DEVICE_CLIENTS as readonly string[]).includes(value);
}

export function isChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

interface PendingHandoff {
  userId: string;
  challenge: string;
  client: DeviceClient;
  expiresAt: number;
}

interface DeviceAuthState {
  handoffs: Map<string, PendingHandoff>;
  attempts: Map<string, number[]>;
}

// One store for the whole process, whichever route bundle loads this module first.
const globalStore = globalThis as typeof globalThis & { __pawosDeviceAuth?: DeviceAuthState };
const state: DeviceAuthState = (globalStore.__pawosDeviceAuth ??= { handoffs: new Map(), attempts: new Map() });

// Only a hash of each handoff is kept: reading this process's memory does not yield a usable one.
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function sweep(now: number): void {
  for (const [key, entry] of state.handoffs) {
    if (entry.expiresAt + EXPIRED_MEMORY_MS <= now) state.handoffs.delete(key);
  }
}

/** A new one-time handoff for a signed-in user who clicked Authorize in their browser. */
export function issueDeviceHandoff(userId: string, challenge: string, client: DeviceClient, now: number = Date.now()): { handoff: string; expiresInSeconds: number } {
  sweep(now);
  // A user holds a few pending handoffs at most; asking again retires the oldest.
  const own = [...state.handoffs].filter(([, entry]) => entry.userId === userId).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (own.length >= MAX_HANDOFFS_PER_USER) state.handoffs.delete(own.shift()![0]);
  if (state.handoffs.size >= MAX_HANDOFFS) throw new Error("Too many sign-ins are pending. Please try again in a few minutes.");

  const handoff = randomBytes(32).toString("base64url");
  state.handoffs.set(hash(handoff), { userId, challenge, client, expiresAt: now + DEVICE_HANDOFF_TTL_MS });
  return { handoff, expiresInSeconds: DEVICE_HANDOFF_TTL_MS / 1000 };
}

export type ConsumeResult = { ok: true; userId: string; client: DeviceClient } | { ok: false; reason: "invalid" | "expired" };

/**
 * Uses a handoff up. Whatever the outcome, it is gone: a wrong verifier, the wrong kind of client,
 * a second attempt or a late one never leaves it usable. Succeeds only for the client that started
 * the sign-in — the one holding the verifier behind the challenge the handoff was issued against.
 */
export function consumeDeviceHandoff(handoff: unknown, verifier: unknown, client: unknown, now: number = Date.now()): ConsumeResult {
  if (typeof handoff !== "string" || !HANDOFF.test(handoff)) return { ok: false, reason: "invalid" };
  const key = hash(handoff);
  const entry = state.handoffs.get(key);
  state.handoffs.delete(key);
  if (!entry || typeof verifier !== "string" || !VERIFIER.test(verifier) || !isDeviceClient(client)) return { ok: false, reason: "invalid" };
  if (entry.expiresAt <= now) return { ok: false, reason: "expired" };
  if (entry.client !== client) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(entry.challenge);
  const offered = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  if (expected.length !== offered.length || !timingSafeEqual(expected, offered)) return { ok: false, reason: "invalid" };
  return { ok: true, userId: entry.userId, client: entry.client };
}

/** Whether this caller may try another exchange right now (a few a minute). */
export function allowExchangeAttempt(caller: string, now: number = Date.now()): boolean {
  const recent = (state.attempts.get(caller) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= EXCHANGE_ATTEMPTS_PER_MINUTE) {
    state.attempts.set(caller, recent);
    return false;
  }
  recent.push(now);
  state.attempts.set(caller, recent);
  if (state.attempts.size > MAX_HANDOFFS) for (const [key, times] of state.attempts) if (times.every((at) => now - at >= 60_000)) state.attempts.delete(key);
  return true;
}

/** Test-only: forget every pending handoff and attempt. */
export function resetDeviceAuthForTests(): void {
  state.handoffs.clear();
  state.attempts.clear();
}

/** What a signed-in client holds. The same shape for every PawOS client. */
export interface ClientSession {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch. */
  expiresAt: number;
  email: string | null;
}

export class DeviceAuthError extends Error {
  constructor(
    readonly code: "not_configured" | "account_unavailable" | "session_expired" | "unavailable",
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function supabaseSettings(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new DeviceAuthError("not_configured", "Sign-in isn't available right now.", 503);
  return { url, anonKey };
}

function toClientSession(body: unknown): ClientSession | null {
  const data = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown; expires_in?: unknown; user?: { email?: unknown } | null };
  if (typeof data.access_token !== "string" || !data.access_token || typeof data.refresh_token !== "string" || !data.refresh_token) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = typeof data.expires_at === "number" ? data.expires_at : now + (typeof data.expires_in === "number" ? data.expires_in : 3600);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt, email: typeof data.user?.email === "string" ? data.user.email : null };
}

/**
 * A new Supabase session of its own for the account the handoff was issued to — separate from the
 * browser's, so signing out of one never signs out the other. Made with Supabase's own one-time
 * sign-in link for that account (generated and used here, on the server; it is never emailed or
 * shown). The service-role key stays on this server; the client receives an ordinary user session.
 */
export async function createSessionForUser(userId: string): Promise<ClientSession> {
  const { url, anonKey } = supabaseSettings();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    throw new DeviceAuthError("not_configured", "Sign-in isn't available right now.", 503);
  }
  const found = await admin.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) throw new DeviceAuthError("account_unavailable", "This PawOS account can't be signed in from here. Contact support.", 409);

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) throw new DeviceAuthError("unavailable", "Sign-in couldn't be completed. Please try again.", 502);

  const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verified = await anonymous.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const session = verified.data.session;
  // The session must be for exactly the account the handoff named.
  if (verified.error || !session || session.user.id !== userId) throw new DeviceAuthError("unavailable", "Sign-in couldn't be completed. Please try again.", 502);
  return { accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in, email: session.user.email ?? email };
}

/** Renews a client's session with its refresh token. The token is used for this call and not kept. */
export async function refreshClientSession(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<ClientSession> {
  const { url, anonKey } = supabaseSettings();
  let response: Response;
  try {
    response = await fetchImpl(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DeviceAuthError("unavailable", "Sign-in couldn't be reached. Please try again.", 503);
  }
  if (response.status >= 400 && response.status < 500 && response.status !== 429) throw new DeviceAuthError("session_expired", "Your PawOS session has expired. Sign in again.", 401);
  const session = response.ok ? toClientSession(await response.json().catch(() => null)) : null;
  if (!session) throw new DeviceAuthError("unavailable", "Sign-in couldn't be reached. Please try again.", 503);
  return session;
}

/** Ends one client session (and only that one). Best effort. */
export async function endClientSession(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { url, anonKey } = supabaseSettings();
  await fetchImpl(`${url}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).then(undefined, () => undefined);
}
