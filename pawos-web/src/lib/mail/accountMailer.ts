import { getFrom, getTransporter } from "./waitlistMailer";

/** PawOS account emails (password reset link, sign-up code), sent from PawOS's SMTP — never Supabase's mail service. */

/** The PawOS "Reset your password" email (same design as supabase/email-templates/reset-password.html). */
export function passwordResetEmail(email: string, link: string): { subject: string; html: string; text: string } {
  const safeEmail = email.replace(/[<>&"]/g, "");
  const safeLink = link.replace(/"/g, "%22");
  return {
    subject: "Reset your PawOS password",
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;color:#f5f5f5;font-size:18px;font-weight:700;">PawOS</td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;color:#ffffff;font-size:20px;font-weight:600;">Reset your password</p>
        <p style="margin:0 0 24px;">We received a request to reset the password for your PawOS account (${safeEmail}). Click the button below to create a new one.</p>
        <a href="${safeLink}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#ffffff;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;">Reset password</a>
        <p style="margin:24px 0 0;color:#a3a3a3;font-size:13px;">This link works once and expires soon. If you didn't ask to reset your password, you can safely ignore this email — your password won't change.</p>
      </td></tr>
      <tr><td style="padding-top:20px;color:#737373;font-size:12px;line-height:1.5;">
        PawOS · Powered by Revanta AI · pawos.revantaai.com<br />
        You're receiving this because a password reset was requested for your PawOS account.
      </td></tr>
    </table>
  </body>
</html>`,
    text: `Reset your password\n\nWe received a request to reset the password for your PawOS account (${safeEmail}). Open this link to create a new one:\n\n${link}\n\nThe link works once and expires soon. If you didn't ask for this, ignore this email — your password won't change.\n\nPawOS · Powered by Revanta AI · pawos.revantaai.com`,
  };
}

export async function sendPasswordResetEmail(email: string, link: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const { subject, html, text } = passwordResetEmail(email, link);
  try {
    await transporter.sendMail({ from: getFrom(), to: email, subject, html, text });
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
