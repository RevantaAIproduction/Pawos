/**
 * Shared by auth/google/callback and auth/github/callback: both routes
 * exist only to receive the OAuth provider's redirect when a PawOS desktop
 * sign-in is in progress, and hand the result back to the desktop app.
 *
 * This used to fetch http://127.0.0.1:PORT from here — which only ever
 * worked when this Next.js server and the Electron app ran on the same
 * machine. Now that pawos-web runs on a real remote host, this process has
 * no network path to a port on the user's own computer. Instead, the page
 * below redirects the browser itself to a pawos:// custom-protocol URL,
 * which Windows/macOS/Linux route directly to the already-running PawOS
 * app (see OAuthProtocolBridge.ts / main.ts's protocol registration) — no
 * server-to-desktop network hop involved at all.
 */
export function relayToDesktop(scheme: "google-auth-callback" | "github-auth-callback", code: string | null, error: string | null): Response {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (error) params.set("error", error);
  const deepLink = `pawos://${scheme}?${params.toString()}`;

  const body = error
    ? `<html><body style="font-family:sans-serif;padding:40px;">
        <p>Sign-in failed: ${escapeHtml(error)}.</p>
        <p><a href="${escapeHtml(deepLink)}">Click here to return to PawOS</a>, or close this window and try again.</p>
      </body></html>`
    : `<html><body style="font-family:sans-serif;padding:40px;">
        <p>Signed in — returning you to PawOS&hellip;</p>
        <p>If nothing happens, <a href="${escapeHtml(deepLink)}">click here</a>.</p>
        <script>window.location.href = ${JSON.stringify(deepLink)};</script>
      </body></html>`;

  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
