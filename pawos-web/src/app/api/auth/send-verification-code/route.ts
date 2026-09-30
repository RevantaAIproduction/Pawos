import { getFrom, getTransporter, wrapEmail } from "../../../../lib/mail/waitlistMailer";

/**
 * Sends a PawOS verification code (account sign-up or password reset) from this server's SMTP.
 * The desktop app generates, hashes and checks the code itself (src/main/mail/otp.ts); it only
 * needs delivery, because an installed/Store build has no SMTP credentials — and must never
 * ship them. Fixed template: the only caller-supplied content is a 6-digit number, so this
 * can't be used to send arbitrary mail. Rate-limited per address and per IP.
 */
const PURPOSES = {
  signup: { subject: "Your PawOS verification code", lead: "Use this code to finish creating your PawOS account." },
  "password-reset": { subject: "Your PawOS password reset code", lead: "Use this code to reset your PawOS password." },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;
const hits = new Map<string, number[]>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code : "";
  const purpose = body.purpose === "password-reset" ? "password-reset" : "signup";
  const minutes = typeof body.expiresInMinutes === "number" && body.expiresInMinutes > 0 && body.expiresInMinutes <= 30 ? Math.round(body.expiresInMinutes) : 5;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ ok: false, error: "Invalid verification code." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(`email:${email}`, MAX_PER_EMAIL) || limited(`ip:${ip}`, MAX_PER_IP)) {
    return Response.json({ ok: false, error: "Too many codes requested. Wait a few minutes and try again." }, { status: 429 });
  }

  const transporter = getTransporter();
  if (!transporter) {
    return Response.json({ ok: false, error: "Email delivery is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const { subject, lead } = PURPOSES[purpose];
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: `${subject}: ${code}`,
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">${lead}</p>
        <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;">${code}</p>
        <p style="margin:0 0 8px;">This code expires in ${minutes} minutes and can be used once.</p>
        <p style="margin:0;color:#a3a3a3;">If you didn't request this, you can ignore this email.</p>
      `),
      text: `${lead}\n\nYour code: ${code}\n\nIt expires in ${minutes} minutes. If you didn't request this, ignore this email.`,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "We couldn't send the email. Please try again." }, { status: 502 });
  }
}
