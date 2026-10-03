import { getFrom, getTransporter, wrapEmail } from "./waitlistMailer";

/**
 * Confirmation email for a new Early Access registration — sent by POST /api/early-access once,
 * right after the row is stored. Reuses waitlistMailer's SMTP transporter, sender and HTML shell
 * (SMTP_HOST/PORT/USER/PASS/EMAIL_FROM); there is no separate configuration for this email.
 */

export const EARLY_ACCESS_EMAIL_SUBJECT = "You're in — PawOS Early Access";
export const PAWOS_STORE_URL = "https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN";

export type EarlyAccessSendResult = { ok: boolean; message?: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** The registrant's name is free text they typed — collapse it to a single line before greeting them with it. */
function greetingName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function buildEarlyAccessConfirmationEmail(name: string): { subject: string; html: string; text: string } {
  const displayName = greetingName(name);
  const storeHref = escapeHtml(PAWOS_STORE_URL);

  const html = wrapEmail(`
        <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">Hi ${escapeHtml(displayName)},</p>
        <p style="margin:0 0 12px;">Thanks for joining the PawOS Early Access program.</p>
        <p style="margin:0 0 20px;">You can download PawOS from the Microsoft Store:</p>
        <a href="${storeHref}" style="display:inline-block;background:#3b82f6;color:#000;font-weight:600;padding:10px 20px;border-radius:999px;text-decoration:none;">Download PawOS</a>
        <p style="margin:16px 0 20px;font-size:12px;word-break:break-all;"><a href="${storeHref}" style="color:#a3a3a3;">${storeHref}</a></p>
        <p style="margin:0 0 20px;">We're excited to have you try PawOS and see how it fits into your engineering workflow.</p>
        <p style="margin:0;color:#a3a3a3;">— PawOS Team</p>
      `);

  const text = [
    `Hi ${displayName},`,
    "",
    "Thanks for joining the PawOS Early Access program.",
    "",
    "You can download PawOS from the Microsoft Store:",
    "",
    "Download PawOS",
    PAWOS_STORE_URL,
    "",
    "We're excited to have you try PawOS and see how it fits into your engineering workflow.",
    "",
    "— PawOS Team",
  ].join("\n");

  return { subject: EARLY_ACCESS_EMAIL_SUBJECT, html, text };
}

/** Never throws — the caller has already stored the registration and must not fail because of email. */
export async function sendEarlyAccessConfirmation(name: string, email: string): Promise<EarlyAccessSendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, message: "SMTP is not configured (SMTP_HOST/PORT/USER/PASS missing)." };
  }
  try {
    await transporter.sendMail({ from: getFrom(), to: email, ...buildEarlyAccessConfirmationEmail(name) });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed to send Early Access confirmation email." };
  }
}
