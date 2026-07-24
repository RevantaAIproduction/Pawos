import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * Website-native OAuth/email-confirmation landing — completes the PKCE code
 * exchange for pawos-web's own signed-in session (Google/GitHub sign-in
 * started from /login or /signup, or a signup confirmation link) and sets
 * the session cookie via the server Supabase client. Not used by the
 * desktop app — see auth/google/callback and auth/github/callback for that.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
