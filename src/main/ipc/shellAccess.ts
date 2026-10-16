import { accountSession } from '../auth/AccountSession';

/**
 * A real interactive shell (the chat's Terminal panel, a Remote Assistance shared terminal) and
 * typing into a running process are code execution, like the coding actions DesktopExecutionEngine
 * gates: they need the verified signed-in account the main process holds — never anything the
 * renderer sends. Same `{ ok: false, message }` shape the callers already handle.
 */
export const SHELL_NEEDS_SIGN_IN = { ok: false, message: 'Sign in to PawOS to use the terminal.' } as const;

export function withSignedInAccount<T>(run: () => T): T | typeof SHELL_NEEDS_SIGN_IN {
  return accountSession.verifiedUserId ? run() : SHELL_NEEDS_SIGN_IN;
}
