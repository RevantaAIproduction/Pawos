/**
 * Whether the last Google/Microsoft sign-in managed to create a real Supabase session
 * (signInWithIdToken). That sign-in itself still succeeds locally when linking fails, so the reason
 * is kept here for the features that need the server session (Admin console, PawOS Build sync,
 * Organizations) to show instead of a generic "not signed in" error.
 */
let lastFailure: { provider: 'google' | 'microsoft'; message: string; at: number } | null = null;

export function recordServerSessionLinkFailure(provider: 'google' | 'microsoft', message: string): void {
  lastFailure = { provider, message, at: Date.now() };
}

export function clearServerSessionLinkFailure(): void {
  lastFailure = null;
}

export function getServerSessionLinkFailure(): { provider: 'google' | 'microsoft'; message: string; at: number } | null {
  return lastFailure;
}
