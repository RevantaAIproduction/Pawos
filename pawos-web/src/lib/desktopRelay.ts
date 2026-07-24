/**
 * Shared by auth/google/callback and auth/github/callback: both routes
 * exist only to receive the OAuth provider's redirect when a PawOS desktop
 * sign-in is in progress, and forward the result to the fixed local port
 * that Electron's GoogleOAuthFlow.ts / GitHubOAuthFlow.ts is listening on
 * (see the matching LOCAL_RELAY_PORT constants there). A public HTTPS URL
 * is what OAuth providers/Supabase actually redirect the browser to; this
 * is the last hop back to the desktop process.
 */
export async function relayToDesktop(localPort: number, code: string | null, error: string | null): Promise<Response> {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (error) params.set("error", error);

  try {
    await fetch(`http://127.0.0.1:${localPort}/relay?${params.toString()}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    // PawOS desktop isn't reachable on this machine (closed, or this link
    // was opened somewhere else) — the page below already tells the user
    // what to do.
  }

  const body = error
    ? `<html><body style="font-family:sans-serif;padding:40px;">Sign-in failed: ${escapeHtml(error)}. You can close this window and try again from PawOS.</body></html>`
    : `<html><body style="font-family:sans-serif;padding:40px;">Signed in — you can close this window and return to PawOS.</body></html>`;

  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
