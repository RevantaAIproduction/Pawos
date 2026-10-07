const PAWOS_WEB_BASE_URL = 'https://pawos.revantaai.com';

/** How the code must be checked with supabase.auth.verifyOtp — decided by the server. */
export type SignupVerifyType = 'signup' | 'email';

/**
 * Asks PawOS (pawos-web /api/auth/signup/code) to email a sign-up verification code — the same
 * step PawOS Web uses. The code is made and checked on the server (Supabase's one-time code): this
 * app never sees it, never chooses it and never decides whether it is right, so an email address
 * can only be confirmed by someone who can read its inbox. The window then proves the code with
 * supabase.auth.verifyOtp and sets the password on the verified account.
 *
 * This replaces the earlier flow where this app generated the code itself (otp.ts) and checked it
 * locally, which a modified client could skip.
 */
export async function requestSignupCode(
  input: { email: string; firstName: string; lastName: string },
  fetchImpl: typeof fetch = fetch
): Promise<{ verifyType: SignupVerifyType }> {
  let response: Response;
  try {
    response = await fetchImpl(`${PAWOS_WEB_BASE_URL}/api/auth/signup/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.email, firstName: input.firstName, lastName: input.lastName }),
    });
  } catch {
    throw new Error("Couldn't reach PawOS to send your verification code. Check your internet connection and try again.");
  }
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; verifyType?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `We couldn't send your verification code (HTTP ${response.status}). Please try again.`);
  }
  return { verifyType: payload.verifyType === 'email' ? 'email' : 'signup' };
}
