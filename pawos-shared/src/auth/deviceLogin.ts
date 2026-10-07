import { createPkcePair } from "./pkce";
import { AuthRejectedError, AuthUnavailableError, type FetchLike, type Session } from "./types";

/**
 * The PawOS browser sign-in every PawOS client uses (pawos-web/src/lib/auth/deviceAuth.ts):
 *
 *   1. the client makes a secret and gives the user the address <PawOS>/auth/device, carrying the
 *      secret's SHA-256;
 *   2. the user signs in to PawOS as usual (Google, GitHub or email) and clicks Authorize;
 *   3. PawOS shows a completion address carrying a one-time handoff; the user pastes it into the client;
 *   4. the client checks the address, sends the handoff with its secret, and receives a session of its own.
 *
 * The pasted address is only ever read as text: it is never opened, fetched or followed. Nothing
 * here logs, and no error carries a handoff, a secret, a token or a response body.
 */
export type DeviceClient = "cli" | "vscode";

export const DEVICE_AUTH_PATH = "/auth/device";
export const DEVICE_COMPLETION_PATH = "/auth/device/complete";
/** 32 random bytes, base64url: 43 characters. */
const HANDOFF = /^[A-Za-z0-9_-]{43}$/;

export function beginDeviceLogin(apiBaseUrl: string, client: DeviceClient): { url: string; verifier: string } {
  const pair = createPkcePair();
  const url = new URL(`${apiBaseUrl}${DEVICE_AUTH_PATH}`);
  url.searchParams.set("challenge", pair.challenge);
  url.searchParams.set("client", client);
  return { url: url.toString(), verifier: pair.verifier };
}

export type CompletionUrl = { ok: true; handoff: string } | { ok: false; reason: string };

const NOT_THE_URL = "That isn't the authentication URL. Copy the URL PawOS shows after you click Authorize.";

/**
 * Reads the completion address the user pasted and returns the handoff in it — or why it was not
 * accepted. Strict on purpose: it must be exactly PawOS's own address, the completion path, and one
 * `handoff` parameter of the right shape. Anything else (another site, another path, a second or
 * repeated parameter, credentials, a fragment) is refused before anything is sent anywhere.
 * The reason never repeats what was pasted.
 */
export function parseCompletionUrl(input: unknown, apiBaseUrl: string): CompletionUrl {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return { ok: false, reason: "Paste the authentication URL PawOS shows after you click Authorize." };
  // Control characters or whitespace inside it: not something PawOS produced.
  if (text.length > 512 || /[\s\u0000-\u001f\u007f-\u009f]/.test(text)) return { ok: false, reason: NOT_THE_URL };

  let url: URL;
  let expected: URL;
  try {
    url = new URL(text);
    expected = new URL(apiBaseUrl);
  } catch {
    return { ok: false, reason: NOT_THE_URL };
  }
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.username || url.password) {
    return { ok: false, reason: `That address isn't from ${expected.host}. Copy the URL PawOS shows after you click Authorize.` };
  }
  if (url.pathname === DEVICE_AUTH_PATH) {
    return { ok: false, reason: "That's the sign-in address. Open it in your browser, click Authorize, then paste the URL PawOS shows you." };
  }
  if (url.pathname !== DEVICE_COMPLETION_PATH || url.hash) return { ok: false, reason: NOT_THE_URL };

  const names = [...url.searchParams.keys()];
  const handoffs = url.searchParams.getAll("handoff");
  if (handoffs.length === 0) return { ok: false, reason: "That URL is incomplete. Copy the whole URL PawOS shows, using its Copy URL button." };
  // Exactly one parameter, and it is the handoff: nothing repeated, nothing extra to be ambiguous about.
  if (handoffs.length !== 1 || names.length !== 1 || !HANDOFF.test(handoffs[0]!)) return { ok: false, reason: NOT_THE_URL };
  return { ok: true, handoff: handoffs[0]! };
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

/**
 * Trades the handoff from a pasted completion address for a session. Only the client that started
 * the sign-in can: PawOS checks the verifier and the kind of client the handoff was issued to.
 */
export async function exchangeCompletionUrl(apiBaseUrl: string, pastedUrl: unknown, verifier: string, client: DeviceClient, fetchImpl: FetchLike = fetch): Promise<Session> {
  const parsed = parseCompletionUrl(pastedUrl, apiBaseUrl);
  if (!parsed.ok) throw new AuthRejectedError(parsed.reason, "invalid_url");
  const { status, data } = await post(apiBaseUrl, "/api/auth/device/exchange", { handoff: parsed.handoff, verifier, client }, fetchImpl);
  const session = status >= 200 && status < 300 && data.ok === true ? toSession(data) : null;
  if (session) return session;
  if (status === 429) throw new AuthUnavailableError(said(data, "Too many attempts. Wait a minute and try again."));
  if (status >= 400 && status < 500) throw new AuthRejectedError(said(data, "That authentication URL isn't valid. Start sign-in again."), typeof data.code === "string" ? data.code : null);
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
