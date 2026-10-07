/**
 * The redirect addresses PawOS itself registers with connector providers. The token exchange
 * (api/connectivity/oauth/exchange) only redeems an authorization code for one of these, so the
 * endpoint cannot be used to finish somebody else's OAuth flow with PawOS's client secret.
 */

/** True when `redirectUri` is one PawOS uses for this connector (desktop protocol, desktop loopback, or the hosted callbacks). */
export function isPawosRedirectUri(connectorId: string, redirectUri: string): boolean {
  if (redirectUri === "pawos://connectivity-oauth-callback") return true;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.search || url.hash || url.username || url.password) return false;
  // Desktop loopback listener (RFC 8252): http://127.0.0.1:<ephemeral port>, any path.
  if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port !== "") return true;
  if (url.origin !== "https://pawos.revantaai.com") return false;
  const paths = [
    `/api/connectors/${connectorId}/callback`,
    `/api/connectors/${connectorId}/oauth/callback`,
    `/api/connectivity/oauth/callback/${connectorId}`,
  ];
  // GitLab's connector app is registered with the /auth path.
  if (connectorId === "gitlab") paths.push("/auth/gitlab/callback");
  return paths.includes(url.pathname);
}
