/**
 * The signed-in user's current Supabase access token, held in main-process memory only (never
 * persisted). The renderer hands it over on every sign-in / token refresh / app start through
 * billing:syncBuildAccess and clears it on sign-out, so main can make best-effort calls to
 * Supabase RPCs as that user — e.g. uploading an app rating or a Build usage report.
 */
let accessToken: string | null = null;

export function setServerAccessToken(token: string | null): void {
  accessToken = token || null;
}

export function getServerAccessToken(): string | null {
  return accessToken;
}

/**
 * The user id (JWT `sub`) inside a Supabase access token, or null. Read without verifying the
 * signature — only used to label local caches; every server call still presents the token itself,
 * which Supabase verifies.
 */
export function accessTokenUserId(token: string | null | undefined): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

type FetchLike =(input: string, init?: RequestInit) => Promise<Response>;

/**
 * POSTs a Supabase RPC as the signed-in user. Resolves to the parsed JSON result, or throws when
 * there is no session, Supabase isn't configured, or the call fails.
 */
export async function callRpcAsUser<T = unknown>(name: string, args: Record<string, unknown>, fetchImpl: FetchLike = fetch): Promise<T> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Supabase is not configured');
  if (!accessToken) throw new Error('Not signed in');
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${name} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
