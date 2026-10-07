import type { PawosConfig } from "../config";

/**
 * The three calls the extension makes to the PawOS Supabase project's auth server — the same
 * project PawOS Web and PawOS Desktop sign in to. Sign-in happens in the browser (PKCE); the
 * extension only ever exchanges the one-time code, refreshes the session and signs out.
 * Nothing here logs, and no error message carries a token or a response body.
 */
export type SignInProvider = "github" | "google";

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in seconds since the epoch. */
  expiresAt: number;
  email: string | null;
}

/** Supabase refused the credentials (a spent code, a revoked or expired refresh token). */
export class AuthRejectedError extends Error {}
/** Supabase could not be reached or failed; nothing is known about the credentials. */
export class AuthUnavailableError extends Error {}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The browser address that starts sign-in. Carries the PKCE challenge, never the verifier. */
export function buildAuthorizeUrl(config: PawosConfig, provider: SignInProvider, redirectTo: string, challenge: string): string {
  const url = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");
  return url.toString();
}

function toSession(body: unknown, now: number): Session | null {
  if (!body || typeof body !== "object") return null;
  const data = body as { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown; expires_in?: unknown; user?: { email?: unknown } | null };
  if (typeof data.access_token !== "string" || !data.access_token || typeof data.refresh_token !== "string" || !data.refresh_token) return null;
  const expiresAt =
    typeof data.expires_at === "number" ? data.expires_at : typeof data.expires_in === "number" ? Math.floor(now / 1000) + data.expires_in : Math.floor(now / 1000) + 3600;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt, email: typeof data.user?.email === "string" ? data.user.email : null };
}

async function tokenRequest(config: PawosConfig, grantType: "pkce" | "refresh_token", body: Record<string, string>, fetchImpl: FetchLike, now: number): Promise<Session> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AuthUnavailableError("PawOS sign-in couldn't be reached. Check your connection and try again.");
  }
  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    throw new AuthRejectedError("PawOS didn't accept the sign-in. Please sign in again.");
  }
  if (!response.ok) throw new AuthUnavailableError("PawOS sign-in is unavailable right now. Please try again.");
  const session = toSession(await response.json().catch(() => null), now);
  if (!session) throw new AuthUnavailableError("PawOS sign-in returned an unexpected answer. Please try again.");
  return session;
}

/** Trades the one-time code from the browser for a session. Only the holder of the verifier can. */
export function exchangeCode(config: PawosConfig, code: string, verifier: string, fetchImpl: FetchLike = fetch, now: number = Date.now()): Promise<Session> {
  return tokenRequest(config, "pkce", { auth_code: code, code_verifier: verifier }, fetchImpl, now);
}

export function refreshSession(config: PawosConfig, refreshToken: string, fetchImpl: FetchLike = fetch, now: number = Date.now()): Promise<Session> {
  return tokenRequest(config, "refresh_token", { refresh_token: refreshToken }, fetchImpl, now);
}

/** Ends this session on the server. Best effort: signing out locally never depends on it. */
export async function revokeSession(config: PawosConfig, accessToken: string, fetchImpl: FetchLike = fetch): Promise<void> {
  await fetchImpl(`${config.supabaseUrl}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).then(undefined, () => undefined);
}
