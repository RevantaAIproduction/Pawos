/**
 * Where the extension talks to: PawOS Web (the API) and the PawOS Supabase project (sign-in only).
 * All three values are application-scoped settings, so a workspace's own settings file can never
 * point the extension — and the signed-in session — at a different server.
 *
 * The Supabase anon key is the public key PawOS Web itself ships to every browser. The extension
 * never has, and never needs, a service-role key, a GitHub token or a model key.
 */
export interface PawosConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export type ConfigResult = { ok: true; config: PawosConfig } | { ok: false; problem: string };

/** https only — except a local development server. */
function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function resolveConfig(raw: { apiBaseUrl?: unknown; supabaseUrl?: unknown; supabaseAnonKey?: unknown }): ConfigResult {
  const apiBaseUrl = typeof raw.apiBaseUrl === "string" ? normaliseUrl(raw.apiBaseUrl) : null;
  if (!apiBaseUrl) return { ok: false, problem: "Set a valid https address in the PawOS: Api Base Url setting." };
  const supabaseUrl = typeof raw.supabaseUrl === "string" && raw.supabaseUrl.trim() ? normaliseUrl(raw.supabaseUrl) : null;
  const supabaseAnonKey = typeof raw.supabaseAnonKey === "string" ? raw.supabaseAnonKey.trim() : "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, problem: "Sign-in isn't set up yet. Add the PawOS Supabase URL and public (anon) key in Settings → PawOS." };
  }
  return { ok: true, config: { apiBaseUrl, supabaseUrl, supabaseAnonKey } };
}
