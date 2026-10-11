/**
 * PawOS Web's own address. Every absolute link the server builds — a redirect after sign-in, the
 * address handed to an OAuth provider, a canonical URL — starts from here.
 *
 * It is NEVER taken from the request's Host or X-Forwarded-Host header in production. Those are
 * whatever the caller sent: the reverse proxy passes X-Forwarded-Host through, and answers for any
 * Host name. An origin built from them lets a caller choose where a sign-in is sent back to.
 */
export const OFFICIAL_SITE_ORIGIN = "https://pawos.revantaai.com";

/** The configured address (NEXT_PUBLIC_SITE_URL), if it is a plain https origin; otherwise the official one. */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return OFFICIAL_SITE_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return OFFICIAL_SITE_ORIGIN;
    return url.origin;
  } catch {
    return OFFICIAL_SITE_ORIGIN;
  }
}

/** Names that only ever mean "this machine" or a test: localhost, loopback addresses, *.localhost and *.test. */
function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost") || name.endsWith(".test");
}

/**
 * The origin to build absolute links from for this request.
 *
 * In production it is always the configured site address, whatever headers arrived. Outside
 * production (local development, tests) a request to a local name gets that name back, so sign-in
 * works on localhost. X-Forwarded-Host is not consulted anywhere.
 */
export function trustedOrigin(request: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const host = request.headers.get("host");
    if (host && isLocalHost(host)) {
      let protocol = "http:";
      try {
        protocol = new URL(request.url).protocol;
      } catch {
        // Keep http for a local name.
      }
      return `${protocol}//${host}`;
    }
  }
  return siteOrigin();
}

/**
 * True when the request's Origin header is this site. Used to refuse a state-changing request that
 * another site caused a browser to send. The comparison is with the trusted origin, not with a
 * Host header the same caller supplied.
 */
export function isSameSiteOrigin(request: Request, origin: string): boolean {
  try {
    return new URL(origin).origin === trustedOrigin(request);
  } catch {
    return false;
  }
}
