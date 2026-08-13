import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { sendWaitlistConfirmation } from "../../../../lib/mail/waitlistMailer";

/**
 * Called by the "Notify me" button when the visitor is already signed in —
 * captures their interest against their own account (no signup form, no
 * re-login) and sends the "we noted your interest" confirmation email
 * immediately. Anonymous visitors never reach this route; they still go
 * through /signup?intent=pawos-desktop-waitlist as before.
 */
export async function POST(request: Request) {
  let body: { platform?: string; source?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — platform/source are optional.
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("desktop_waitlist")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isNew = !existing;

  const { error: upsertError } = await supabase.from("desktop_waitlist").upsert(
    {
      user_id: user.id,
      email: user.email,
      platform: body.platform ?? null,
      source: body.source ?? null,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  // Only send the confirmation on first opt-in — repeat clicks (e.g. from a
  // different platform's download page) just update platform/source.
  if (isNew) {
    const sendResult = await sendWaitlistConfirmation(user.email);
    if (!sendResult.ok) {
      // The waitlist entry is real either way — an email delivery problem
      // shouldn't be reported to the user as "you're not on the list."
      console.error("[waitlist] confirmation email failed to send:", sendResult.message);
    }
  }

  return NextResponse.json({ ok: true, isNew });
}
