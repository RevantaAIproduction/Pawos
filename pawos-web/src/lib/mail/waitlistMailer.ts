import nodemailer from "nodemailer";

/**
 * Minimal SMTP mailer for the desktop launch waitlist. Reuses the exact
 * same env var names as the Electron app's own EmailService
 * (src/main/mail/EmailService.ts) — SMTP_HOST/PORT/USER/PASS/EMAIL_FROM —
 * so the same Gmail App Password already configured for the desktop app
 * can be copied straight into pawos-web/.env without renaming anything.
 * pawos-web has no other email-sending capability today; this is the first.
 */

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      // Gmail App Passwords are displayed with spaces — strip them, matching
      // the same fix already applied in the Electron app's EmailService.
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });
  }
  return cachedTransporter;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? "PawOS <no-reply@revantaai.com>";
}

function wrapEmail(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;">
        <span style="color:#e5e5e5;font-size:18px;font-weight:700;">PawOS</span>
      </td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding-top:20px;color:#525252;font-size:12px;">
        PawOS · Revanta AI
      </td></tr>
    </table>
  </body>
</html>`;
}

export type WaitlistSendResult = { ok: boolean; message?: string };

/**
 * Sent immediately when a signed-in user clicks "Notify me" — confirms
 * their interest was recorded and sets expectation for what happens next.
 */
export async function sendWaitlistConfirmation(email: string): Promise<WaitlistSendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, message: "SMTP is not configured (SMTP_HOST/PORT/USER/PASS missing)." };
  }
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: "You're on the PawOS Desktop launch list",
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">Noted your interest in PawOS.</p>
        <p style="margin:0 0 12px;">We've recorded that you'd like PawOS Desktop as soon as it's available. We'll email you the moment public installers launch — no need to check back.</p>
        <p style="margin:0;color:#a3a3a3;">You'll also get an email whenever we ship a new version after launch.</p>
      `),
      text: "Noted your interest in PawOS. We'll email you the moment PawOS Desktop launches, and again for future version updates.",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to send confirmation email." };
  }
}

/** Sent once, to every waitlist subscriber, the moment PawOS Desktop actually launches. */
export async function sendWaitlistLaunchEmail(email: string, downloadUrl: string): Promise<WaitlistSendResult> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, message: "SMTP is not configured." };
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: "PawOS Desktop is here",
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">PawOS Desktop just launched.</p>
        <p style="margin:0 0 20px;">You asked to be notified — it's live now. Download it and get started.</p>
        <a href="${downloadUrl}" style="display:inline-block;background:#3b82f6;color:#000;font-weight:600;padding:10px 20px;border-radius:999px;text-decoration:none;">Download PawOS</a>
      `),
      text: `PawOS Desktop just launched. Download it here: ${downloadUrl}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to send launch email." };
  }
}

/** Sent to every subscriber for a new version release after launch. */
export async function sendWaitlistUpdateEmail(
  email: string,
  version: string,
  notes: string,
  downloadUrl: string
): Promise<WaitlistSendResult> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, message: "SMTP is not configured." };
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: `PawOS ${version} is available`,
      html: wrapEmail(`
        <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">PawOS ${version} is out.</p>
        <p style="margin:0 0 20px;white-space:pre-line;">${notes}</p>
        <a href="${downloadUrl}" style="display:inline-block;background:#3b82f6;color:#000;font-weight:600;padding:10px 20px;border-radius:999px;text-decoration:none;">Update PawOS</a>
      `),
      text: `PawOS ${version} is out. ${notes} Download: ${downloadUrl}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to send update email." };
  }
}
