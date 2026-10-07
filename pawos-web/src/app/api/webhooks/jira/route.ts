import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * POST /api/webhooks/jira — Jira issue events.
 *
 * Nothing in the body is read, logged or acted on until the request is proven to come from the
 * Jira webhook PawOS registered: Jira signs each delivery with the webhook's secret and sends
 * `X-Hub-Signature: sha256=<hex HMAC of the raw body>`. JIRA_WEBHOOK_SECRET must be that secret.
 * With no secret configured every request is refused (there is nothing to verify against), so an
 * unconfigured deployment can never be driven by a forged event.
 *
 * Today a verified event is only acknowledged — queueing tickets for autonomous work is not wired
 * up. When it is, it must also (a) map the event to an organization from PawOS's own stored
 * connection for that Jira site, never from fields in the payload, and (b) drop repeats using the
 * delivery id (X-Atlassian-Webhook-Identifier).
 */
const MAX_BODY_BYTES = 1_000_000;
const HANDLED_EVENTS = new Set(["jira:issue_created", "jira:issue_updated"]);

/** Constant-time check of Jira's `sha256=<hex>` signature over the exact bytes received. */
function verifyJiraSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.JIRA_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "Jira webhooks are not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "Payload too large." }, { status: 413 });
  }
  if (!verifyJiraSignature(rawBody, request.headers.get("x-hub-signature"), secret)) {
    return NextResponse.json({ ok: false, reason: "Invalid webhook signature." }, { status: 401 });
  }

  let body: { webhookEvent?: unknown; issue?: { key?: unknown } } | null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }
  const event = typeof body?.webhookEvent === "string" ? body.webhookEvent : "";
  const issueKey = typeof body?.issue?.key === "string" && /^[A-Z][A-Z0-9_]{0,31}-\d{1,10}$/.test(body.issue.key) ? body.issue.key : null;

  if (HANDLED_EVENTS.has(event) && issueKey) {
    // The issue key only — summaries and assignee emails are customer data and stay out of the logs.
    console.log(`[jira-webhook] verified ${event} for ${issueKey}`);
  }
  return NextResponse.json({ ok: true });
}
