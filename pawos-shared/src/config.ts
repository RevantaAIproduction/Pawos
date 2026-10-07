/** PawOS's public address — the one address a PawOS client talks to. */
export const DEFAULT_API_BASE_URL = "https://pawos.revantaai.com";

export type ApiConfig = { ok: true; config: { apiBaseUrl: string } } | { ok: false; problem: string };

/** https only (a local development server aside), and never an address with credentials in it. */
export function normaliseBaseUrl(raw: string): string | null {
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

export function resolveApiConfig(raw: unknown, where: string): ApiConfig {
  const apiBaseUrl = typeof raw === "string" && raw.trim() ? normaliseBaseUrl(raw) : raw === undefined || raw === null || raw === "" ? DEFAULT_API_BASE_URL : null;
  return apiBaseUrl ? { ok: true, config: { apiBaseUrl } } : { ok: false, problem: `${where} must be a valid https address.` };
}
