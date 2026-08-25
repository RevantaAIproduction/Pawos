import nodemailer from "nodemailer";

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
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });
  }
  return cachedTransporter;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? "PawOS Billing <billing@revantaai.com>";
}

function wrapEmail(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr><td style="padding-bottom:24px;">
        <span style="color:#e5e5e5;font-size:18px;font-weight:700;">PawOS Billing</span>
      </td></tr>
      <tr><td style="background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding-top:20px;color:#525252;font-size:12px;">
        PawOS Billing · Revanta AI<br/>For support, reply to this email.
      </td></tr>
    </table>
  </body>
</html>`;
}

export type InvoiceSendResult = { ok: boolean; message?: string };

export async function sendInvoiceEmail(
  to: string,
  organizationName: string,
  invoices: Array<{ id: string; amount: number; url: string }>,
  invoiceCount: number
): Promise<InvoiceSendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, message: "Email service not configured (SMTP_HOST/PORT/USER/PASS missing)." };
  }

  try {
    const invoiceHtml = invoices
      .map(
        (inv, idx) => `
      <div style="margin-bottom:16px;padding:12px;background:#0a0a0a;border-radius:8px;border:1px solid #262626;">
        <div style="font-weight:600;margin-bottom:8px;">Invoice ${idx + 1} of ${invoiceCount}</div>
        <div style="margin-bottom:8px;">ID: <code style="background:#0a0a0a;padding:2px 4px;border-radius:3px;">${inv.id}</code></div>
        <div style="margin-bottom:8px;">Amount: ₹${inv.amount.toLocaleString()}</div>
        <div><a href="${inv.url}" style="color:#3b82f6;text-decoration:none;">View Invoice</a></div>
      </div>
    `
      )
      .join("");

    const html = wrapEmail(`
      <p style="margin:0 0 16px;color:#f5f5f5;font-size:16px;font-weight:600;">Invoice Created</p>
      <p style="margin:0 0 16px;">Organization: <strong>${organizationName}</strong></p>
      <p style="margin:0 0 16px;">We've created ${invoiceCount} invoice${invoiceCount > 1 ? "s" : ""} for your purchase. Details below:</p>
      ${invoiceHtml}
      <p style="margin:16px 0 0;color:#a3a3a3;font-size:13px;">A PawOS support specialist will reach out shortly to discuss payment and next steps.</p>
    `);

    await transporter.sendMail({
      from: getFrom(),
      to,
      subject: `PawOS Invoice Created - ${organizationName}`,
      html,
      text: `Invoice Created for ${organizationName}. A support specialist will contact you shortly.`,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Email send failed" };
  }
}
