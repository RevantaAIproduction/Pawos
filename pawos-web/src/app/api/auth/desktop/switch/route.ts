import { NextResponse } from "next/server";
import { rejectCrossOrigin } from "../../../../../lib/account/api";
import { createClient } from "../../../../../lib/supabase/server";
import { desktopSignInPath, isValidChallenge } from "../../../../../lib/desktopSignIn";

/**
 * POST /api/auth/desktop/switch — "Use a different account" on /auth/desktop: signs this browser
 * out and sends it to log in, then back to the PawOS Desktop sign-in with the new account.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origin = host ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}` : new URL(request.url).origin;

  const form = await request.formData().catch(() => null);
  const challenge = form?.get("challenge");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const next = isValidChallenge(challenge) ? `?next=${encodeURIComponent(desktopSignInPath(challenge))}` : "";
  return NextResponse.redirect(`${origin}/login${next}`, 303);
}
