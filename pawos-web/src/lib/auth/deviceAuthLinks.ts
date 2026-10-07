/**
 * The addresses of the PawOS client sign-in (see deviceAuth.ts). Kept apart from deviceAuth.ts,
 * which is server-only, so the page's client component can use them too. They carry the client's
 * one-way challenge and its kind, or the one-time handoff — never a session, a token or a key.
 */

/** The sign-in page for one pending client sign-in. */
export function deviceAuthPath(challenge: string, client: string): string {
  return `/auth/device?challenge=${encodeURIComponent(challenge)}&client=${encodeURIComponent(client)}`;
}

/** The existing PawOS login page, set to come back to that sign-in once the user has signed in. */
export function deviceAuthLoginPath(challenge: string, client: string): string {
  return `/login?next=${encodeURIComponent(deviceAuthPath(challenge, client))}`;
}

/** Where the completion address points. The page there is a notice; the address is meant to be pasted, not opened. */
export const DEVICE_COMPLETION_PATH = "/auth/device/complete";

/**
 * The address the user copies back to their PawOS client after clicking Authorize. Its one
 * parameter is the one-time handoff: short-lived, single-use, and of no use to anyone but the
 * client that started the sign-in.
 */
export function deviceCompletionUrl(origin: string, handoff: string): string {
  return `${origin.replace(/\/+$/, "")}${DEVICE_COMPLETION_PATH}?handoff=${encodeURIComponent(handoff)}`;
}
