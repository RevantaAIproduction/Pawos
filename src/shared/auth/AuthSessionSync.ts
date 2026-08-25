/**
 * Synchronizes Supabase auth sessions between web and desktop.
 *
 * Web stores session in cookies (Supabase default).
 * Desktop stores session in localStorage under 'pawos:supabase:session'.
 *
 * When either authenticates, they write the Supabase tokens to a shared location
 * so the other can load them on next startup.
 */

export interface SharedAuthSession {
  user_id: string;
  access_token: string;
  refresh_token: string;
  email: string;
  provider: string; // 'google' | 'github' | 'azure' | 'email'
  created_at: number;
}

/**
 * Extract Supabase session tokens from auth response.
 * Used when OAuth completes to persist the session for cross-app access.
 */
export function extractSessionFromAuth(data: any): SharedAuthSession | null {
  if (!data?.session) return null;

  const session = data.session;
  if (!session.user?.id || !session.access_token) return null;

  return {
    user_id: session.user.id,
    access_token: session.access_token,
    refresh_token: session.refresh_token || '',
    email: session.user.email || '',
    provider: session.user.user_metadata?.provider || 'unknown',
    created_at: Date.now(),
  };
}

/**
 * Check if a stored session is still valid (not expired).
 * Sessions typically last 1 hour (3600 seconds).
 */
export function isSessionValid(session: SharedAuthSession): boolean {
  const ageMinutes = (Date.now() - session.created_at) / 1000 / 60;
  return ageMinutes < 55; // Refresh before 55 minutes to be safe
}
