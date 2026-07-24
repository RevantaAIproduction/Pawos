/** Profile fields returned by Google's userinfo endpoint after a real OAuth sign-in. */
export type GoogleProfile = { sub: string; name: string; email: string; picture?: string };

/**
 * Result of a real Google sign-in — the profile plus the raw OIDC ID token
 * (and access token) from Google's token endpoint. The 'openid' scope was
 * already being requested (see GoogleOAuthFlow.ts), so Google already
 * returns an id_token; this type carries it out to the renderer so it can
 * bridge into a real Supabase session via supabase.auth.signInWithIdToken()
 * — otherwise a Google-signed-in PawOS user has no Supabase session at all,
 * and every Supabase-backed feature (Organizations, RLS) rejects them.
 */
export type GoogleSignInResult = { profile: GoogleProfile; idToken: string; accessToken: string };
