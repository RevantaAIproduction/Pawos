import { createHash, randomBytes } from 'crypto';
import { shell } from 'electron';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

/**
 * "Continue with browser": signs PawOS Desktop in with the account already signed in on PawOS Web
 * (pawos-web/src/lib/desktopSignIn.ts has the whole flow). The verifier never leaves this process:
 * the browser only ever sees its SHA-256 challenge and hands back a short one-time code
 * (pawos://web-auth-callback?code=…), which is worthless without the verifier.
 *
 * Resolves with a one-time Supabase token hash; the renderer verifies it (verifyOtp) to get the
 * app's own session.
 */

const PAWOS_WEB_BASE_URL = 'https://pawos.revantaai.com';
/** Long enough to log in or sign up on the website first. */
const TIMEOUT_MS = 10 * 60 * 1000;

export type WebSignInResult = { tokenHash: string; email: string };

let cancelPending: (() => void) | null = null;

/** "Cancel" in the app: stops waiting for the browser. */
export function cancelWebSignIn(): void {
  cancelPending?.();
}

export function createVerifier(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export async function startWebSignIn(fetchImpl: typeof fetch = fetch): Promise<WebSignInResult> {
  const { verifier, challenge } = createVerifier();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const code = new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      unregisterPendingOAuth('web');
      cancelPending = null;
      fn();
    };
    cancelPending?.();
    cancelPending = () => finish(() => reject(new Error('Signing in with the browser was cancelled.')));
    registerPendingOAuth('web', { resolve: (value) => finish(() => resolve(value)), reject: (err) => finish(() => reject(err)) });
    timeout = setTimeout(() => finish(() => reject(new Error('Signing in with the browser timed out. Try again.'))), TIMEOUT_MS);
  });

  try {
    await shell.openExternal(`${PAWOS_WEB_BASE_URL}/auth/desktop?challenge=${encodeURIComponent(challenge)}`);
  } catch (err) {
    if (timeout) clearTimeout(timeout);
    unregisterPendingOAuth('web');
    throw err;
  }

  const res = await fetchImpl(`${PAWOS_WEB_BASE_URL}/api/auth/desktop/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: await code, verifier }),
  });
  const body = (await res.json().catch(() => ({}))) as { tokenHash?: unknown; email?: unknown; message?: unknown };
  if (!res.ok || typeof body.tokenHash !== 'string' || typeof body.email !== 'string') {
    throw new Error(typeof body.message === 'string' ? body.message : 'Signing in with the browser could not be completed. Try again.');
  }
  return { tokenHash: body.tokenHash, email: body.email };
}
