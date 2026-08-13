import { NextResponse } from "next/server";
import { createServiceClient } from "../../../../lib/supabase/serviceClient";
import { sendWaitlistLaunchEmail, sendWaitlistUpdateEmail } from "../../../../lib/mail/waitlistMailer";

/**
 * Sends the launch or version-update email to every waitlist subscriber who
 * hasn't already received it. This is not triggered automatically by any
 * release process (pawos-web has no CI/deploy hook that knows "a release
 * just went public") — it's a real, working send mechanism that must be
 * called once, on purpose, when PawOS Desktop actually launches, and again
 * for each future version. Protected by a shared secret since pawos-web has
 * no admin-auth wired into its own API routes yet.
 *
 * Usage once launched:
 *   curl -X POST https://pawos.revantaai.com/api/waitlist/broadcast \
 *     -H "x-broadcast-secret: <WAITLIST_BROADCAST_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"kind":"launch","downloadUrl":"https://pawos.revantaai.com/download"}'
 *
 * For a version update, add "version" and "notes":
 *   -d '{"kind":"update","version":"1.2.0","notes":"...","downloadUrl":"..."}'
 */
export async function POST(request: Request) {
  const secret = process.env.WAITLIST_BROADCAST_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, message: "WAITLIST_BROADCAST_SECRET not configured." }, { status: 500 });
  }
  if (request.headers.get("x-broadcast-secret") !== secret) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as
    | { kind: "launch"; downloadUrl: string }
    | { kind: "update"; version: string; notes: string; downloadUrl: string }
    | null;

  if (!body || (body.kind !== "launch" && body.kind !== "update") || !body.downloadUrl) {
    return NextResponse.json({ ok: false, message: "Invalid body." }, { status: 400 });
  }

  const supabase = createServiceClient();

  let query = supabase.from("desktop_waitlist").select("id, email");
  query = body.kind === "launch" ? query.is("launch_notified_at", null) : query;
  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const result =
      body.kind === "launch"
        ? await sendWaitlistLaunchEmail(row.email, body.downloadUrl)
        : await sendWaitlistUpdateEmail(row.email, body.version, body.notes, body.downloadUrl);

    if (!result.ok) {
      failed += 1;
      console.error(`[waitlist] broadcast send failed for ${row.email}:`, result.message);
      continue;
    }
    sent += 1;

    const update =
      body.kind === "launch"
        ? { launch_notified_at: new Date().toISOString() }
        : { last_update_notified_at: new Date().toISOString(), last_update_version: body.version };
    await supabase.from("desktop_waitlist").update(update).eq("id", row.id);
  }

  return NextResponse.json({ ok: true, sent, failed, total: rows?.length ?? 0 });
}
