import { randomUUID } from "crypto";
import { getFrom, getTransporter } from "./waitlistMailer";

/** PawOS account emails (password reset link, sign-up code), sent from PawOS's SMTP — never Supabase's mail service. */

/**
 * The PawOS "Reset your password" email (same design as supabase/email-templates/reset-password.html).
 *
 * Each email carries its request time in the subject and body. Requesting a new link invalidates
 * every earlier one, and identical emails get threaded and collapsed by Gmail — so the link people
 * clicked was often an older, already-dead one ("This link has expired" on the 2nd and 3rd try).
 */
export function passwordResetEmail(email: string, link: string, requestedAt: Date = new Date()): { subject: string; html: string; text: string } {
  const safeEmail = email.replace(/[<>&"]/g, "");
  const safeLink = link.replace(/"/g, "%22");
  const when = `${requestedAt.toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} UTC`;
  return {
    subject: `Reset your PawOS password (requested ${when})`,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;color:#f5f5f5;font-size:18px;font-weight:700;">PawOS</td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;color:#ffffff;font-size:20px;font-weight:600;">Reset your password</p>
        <p style="margin:0 0 24px;">We received a request to reset the password for your PawOS account (${safeEmail}). Click the button below to create a new one.</p>
        <a href="${safeLink}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#ffffff;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;">Reset password</a>
        <p style="margin:24px 0 0;color:#a3a3a3;font-size:13px;">Requested ${when}. This link works once and expires soon, and only the newest reset email works — requesting another link turns this one off. If you didn't ask to reset your password, you can safely ignore this email — your password won't change.</p>
      </td></tr>
      <tr><td style="padding-top:20px;color:#737373;font-size:12px;line-height:1.5;">
        PawOS · Powered by Revanta AI · pawos.revantaai.com<br />
        You're receiving this because a password reset was requested for your PawOS account.
      </td></tr>
    </table>
  </body>
</html>`,
    text: `Reset your password\n\nWe received a request to reset the password for your PawOS account (${safeEmail}). Open this link to create a new one:\n\n${link}\n\nRequested ${when}. The link works once and expires soon, and only the newest reset email works. If you didn't ask for this, ignore this email — your password won't change.\n\nPawOS · Powered by Revanta AI · pawos.revantaai.com`,
  };
}

export async function sendPasswordResetEmail(email: string, link: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const { subject, html, text } = passwordResetEmail(email, link);
  try {
    // A unique X-Entity-Ref-ID keeps Gmail from threading reset emails together and hiding the newest link.
    await transporter.sendMail({ from: getFrom(), to: email, subject, html, text, headers: { "X-Entity-Ref-ID": randomUUID() } });
    return true;
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    console.error("[password-reset] SMTP send failed:", err?.code, err?.responseCode);
    return false;
  }
}

/** The PawOS "Verify your email" code email for creating an account. */
export async function sendSignupCodeEmail(email: string, code: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const safeCode = code.replace(/\D/g, "");
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: `${safeCode} is your PawOS verification code`,
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;color:#f5f5f5;font-size:18px;font-weight:700;">PawOS</td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;color:#ffffff;font-size:20px;font-weight:600;">Verify your email</p>
        <p style="margin:0 0 20px;">Enter this code on PawOS to verify your email and finish creating your account.</p>
        <p style="margin:0 0 20px;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:8px;">${safeCode}</p>
        <p style="margin:0;color:#a3a3a3;font-size:13px;">The code works once and expires soon. If you didn't try to create a PawOS account, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="padding-top:20px;color:#737373;font-size:12px;line-height:1.5;">PawOS · Powered by Revanta AI · pawos.revantaai.com</td></tr>
    </table>
  </body>
</html>`,
      text: `Verify your email\n\nYour PawOS verification code: ${safeCode}\n\nIt works once and expires soon. If you didn't try to create a PawOS account, ignore this email.\n\nPawOS · Powered by Revanta AI · pawos.revantaai.com`,
    });
    return true;
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    console.error("[signup-code] SMTP send failed:", err?.code, err?.responseCode);
    return false;
  }
}

function accountEmailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;color:#f5f5f5;font-size:18px;font-weight:700;">PawOS</td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;color:#ffffff;font-size:20px;font-weight:600;">${title}</p>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding-top:20px;color:#737373;font-size:12px;line-height:1.5;">PawOS · Powered by Revanta AI · pawos.revantaai.com</td></tr>
    </table>
  </body>
</html>`;
}

/** The code that confirms "Delete my PawOS account" (Settings → Delete account on PawOS Web). */
export async function sendAccountDeleteCodeEmail(email: string, code: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const safeCode = code.replace(/\D/g, "");
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: `${safeCode} is your code to delete your PawOS account`,
      headers: { "X-Entity-Ref-ID": randomUUID() },
      html: accountEmailShell(
        "Confirm account deletion",
        `<p style="margin:0 0 20px;">Someone signed in to your PawOS account asked to delete it. Enter this code in Settings to confirm.</p>
        <p style="margin:0 0 20px;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:8px;">${safeCode}</p>
        <p style="margin:0;color:#a3a3a3;font-size:13px;">The code expires in 10 minutes. Deleting your account can't be undone. If this wasn't you, don't share the code and change your password.</p>`
      ),
      text: `Confirm account deletion\n\nYour code: ${safeCode}\n\nIt expires in 10 minutes. Deleting your account can't be undone. If this wasn't you, don't share the code and change your password.\n\nPawOS · Powered by Revanta AI · pawos.revantaai.com`,
    });
    return true;
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    console.error("[account-delete] SMTP send failed:", err?.code, err?.responseCode);
    return false;
  }
}

/** Sent after the account is deleted. Best effort: the deletion already happened either way. */
export async function sendAccountDeletedEmail(email: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: getFrom(),
      to: email,
      subject: "Your PawOS account has been deleted",
      html: accountEmailShell(
        "Your account has been deleted",
        `<p style="margin:0 0 12px;">Your PawOS account and all of its data — your chats, history, files, connections, credits, and payment and invoice records — have been deleted, and any subscription was cancelled so you won't be charged again. PawOS no longer has your email address; this is the last email you'll get from us.</p>
        <p style="margin:0;color:#a3a3a3;font-size:13px;">If you didn't do this, contact pawos@revantaai.com right away.</p>`
      ),
      text: `Your account has been deleted\n\nYour PawOS account and all of its data — your chats, history, files, connections, credits, and payment and invoice records — have been deleted, and any subscription was cancelled so you won't be charged again. PawOS no longer has your email address; this is the last email you'll get from us.\n\nIf you didn't do this, contact pawos@revantaai.com right away.\n\nPawOS · Powered by Revanta AI · pawos.revantaai.com`,
    });
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    console.error("[account-delete] confirmation email failed:", err?.code, err?.responseCode);
  }
}
