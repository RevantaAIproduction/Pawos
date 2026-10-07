import { createPkcePair } from "./pkce";
import { AuthRejectedError, AuthUnavailableError, type FetchLike, type Session } from "./types";

/**
 * The PawOS browser sign-in every PawOS client uses (pawos-web/src/lib/auth/deviceAuth.ts):
 *
 *   1. the client makes a secret and opens the browser at <PawOS>/auth/device with its SHA-256;
 *   2. the user signs in to PawOS as usual (Google, GitHub or email) and confirms;
 *   3. PawOS shows a one-time code; the user pastes it into the client;
 *   4. the client sends the code with its secret and receives a session of its own.
 *
 * Nothing here logs, and no error carries a code, a secret, a token or a response body.
 */
export type DeviceClient = "cli" | "vscode";

export function beginDeviceLogin(apiBaseUrl: string, client: DeviceClient): { url: string; verifier: string } {
  const pair = createPkcePair();
  const url = new URL(`${apiBaseUrl}/auth/device`);
  url.searchParams.set("challenge", pair.challenge);
  url.searchParams.set("client", client);
  return { url: url.toString(), verifier: pair.verifier };
}

/** Whether pasted text could be a PawOS authentication code ("PAWOS-8F4K-92KD", typed any way). */
export function looksLikeLoginCode(raw: string): boolean {
  return /^[A-Z0-9]{8}$/.test(raw.toUpperCase().replace(/[\s-]/g, "").replace(/^PAWOS/, ""));
}

function toSession(body: unknown): Session | null {
  const session = (body as { session?: Partial<Session> } | null)?.session;
  if (!session || typeof session.accessToken !== "string" || !session.accessToken || typeof session.refreshToken !== "string" || !session.refreshToken || typeof session.expiresAt !== "number") return null;
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt, email: typeof session.email === "string" ? session.email : null };
}

async function post(apiBaseUrl: string, path: string, body: unknown, fetchImpl: FetchLike, headers: Record<string, string> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AuthUnavailableError("PawOS couldn't be reached. Check your connection and try again.");
  }
  const parsed = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, data: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {} };
}

/** PawOS's own words for a refusal, when it sent any. */
function said(data: Record<string, unknown>, fallback: string): string {
  return typeof data.message === "string" && data.message ? data.message : fallback;
}

/** Trades the pasted one-time code for a session. Only the client that started the sign-in can. */
export async function exchangeLoginCode(apiBaseUrl: string, code: string, verifier: string, fetchImpl: FetchLike = fetch): Promise<Session> {
  if (!looksLikeLoginCode(code)) throw new AuthRejectedError("That doesn't look like a PawOS authentication code. It looks like PAWOS-XXXX-XXXX.", "invalid_code");
  const { status, data } = await post(apiBaseUrl, "/api/auth/device/exchange", { code: code.trim(), verifier }, fetchImpl);
  const session = status >= 200 && status < 300 && data.ok === true ? toSession(data) : null;
  if (session) return session;
  if (status === 429) throw new AuthUnavailableError(said(data, "Too many attempts. Wait a minute and try again."));
  if (status >= 400 && status < 500) throw new AuthRejectedError(said(data, "That code isn't valid. Start sign-in again."), typeof data.code === "string" ? data.code : null);
  throw new AuthUnavailableError(said(data, "PawOS sign-in is unavailable right now. Please try again."));
}

/** Renews a session through PawOS. */
export async function refreshSession(apiBaseUrl: string, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<Session> {
  const { status, data } = await post(apiBaseUrl, "/api/auth/device/refresh", { refreshToken }, fetchImpl);
  const session = status >= 200 && status < 300 && data.ok === true ? toSession(data) : null;
  if (session) return session;
  if (status === 401 || status === 400 || status === 403) throw new AuthRejectedError("Your PawOS session has expired. Sign in again.", "session_expired");
  throw new AuthUnavailableError("PawOS sign-in is unavailable right now. Please try again.");
}

/** Ends this session on the server (and only this one). Best effort. */
export async function endSession(apiBaseUrl: string, accessToken: string, fetchImpl: FetchLike = fetch): Promise<void> {
  await post(apiBaseUrl, "/api/auth/device/logout", {}, fetchImpl, { Authorization: `Bearer ${accessToken}` }).then(undefined, () => undefined);
}
