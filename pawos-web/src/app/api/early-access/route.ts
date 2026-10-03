import { NextResponse } from "next/server";
import { createServiceClient } from "../../../lib/supabase/serviceClient";
import { sendEarlyAccessConfirmation } from "../../../lib/mail/earlyAccessMailer";
import {
  EARLY_ACCESS_INITIAL_STATUS,
  EARLY_ACCESS_SOURCE,
  validateEarlyAccessInput,
} from "../../../lib/earlyAccess";

/**
 * POST /api/early-access — the public Early Access form's only endpoint. Anonymous by design
 * (visitors have no PawOS account yet), so the insert uses the service-role client: the table
 * has RLS enabled with no policies, and this route's own validation is the only way a row gets
 * written. Once the row is stored, one confirmation email goes to the registrant (see
 * lib/mail/earlyAccessMailer.ts); no account is created.
 *
 * Responses: 200 { ok: true } · 400 { ok: false, errors } · 409 { ok: false, code: "duplicate" }
 * · 429 rate limited · 503 storage not configured · 500 storage failure.
 */

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
/** Per-process only — a basic brake on scripted submissions, not a substitute for edge rate limiting. */
const attemptsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    attemptsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  attemptsByIp.set(ip, recent);
  if (attemptsByIp.size > 5000) {
    for (const [key, times] of attemptsByIp) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) attemptsByIp.delete(key);
    }
  }
  return false;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  // Honeypot: the form renders a visually hidden "website" input no person fills in. A bot that
  // does gets the same success response as a real registration, and nothing is stored.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Please try again in a few minutes." },
      { status: 429 }
    );
  }

  const validation = validateEarlyAccessInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: "Please check the highlighted fields.", errors: validation.errors },
      { status: 400 }
    );
  }
  const registration = validation.value;

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    console.error("[early-access] SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not configured.");
    return NextResponse.json(
      { ok: false, message: "Early Access registration isn't available right now. Please try again later." },
      { status: 503 }
    );
  }

  const { error } = await supabase.from("early_access_registrations").insert({
    name: registration.name,
    email: registration.email,
    role: registration.role,
    company: registration.company,
    github_profile: registration.githubProfile,
    selected_workflows: registration.selectedWorkflows,
    custom_use_case: registration.customUseCase,
    source: EARLY_ACCESS_SOURCE,
    status: EARLY_ACCESS_INITIAL_STATUS,
  });

  if (error) {
    // 23505 = unique_violation on idx_early_access_registrations_email.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, code: "duplicate", message: "This email is already on the PawOS Early Access list." },
        { status: 409 }
      );
    }
    console.error("[early-access] insert failed:", error.code, error.message);
    return NextResponse.json(
      { ok: false, message: "We couldn't save your registration. Please try again." },
      { status: 500 }
    );
  }

  // Only reached once the row exists — a validation failure, a duplicate (409) or a failed insert
  // returns above and sends nothing, so a retry can't produce a second email. The registration is
  // real either way: an email delivery problem is logged, never reported as "you're not on the list."
  const sendResult = await sendEarlyAccessConfirmation(registration.name, registration.email);
  if (!sendResult.ok) {
    console.error("[early-access] confirmation email failed to send:", sendResult.message);
  }

  return NextResponse.json({ ok: true });
}
