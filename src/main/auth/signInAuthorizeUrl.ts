/**
 * The only address the app will open in the system browser to start a Google / GitHub sign-in: the
 * PawOS account service's own authorize endpoint (`<SUPABASE_URL>/auth/v1/authorize`). The window
 * asks the main process to open the URL it built, and the main process opens nothing else through
 * that request — not another site, and not another scheme (file:, ms-settings:, a custom protocol).
 */
export function isSignInAuthorizeUrl(candidate: unknown, supabaseUrl: string | undefined): candidate is string {
  if (typeof candidate !== 'string' || !supabaseUrl) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(candidate);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && base.protocol === 'https:' && url.host === base.host && !url.username && !url.password && url.pathname === '/auth/v1/authorize';
}
