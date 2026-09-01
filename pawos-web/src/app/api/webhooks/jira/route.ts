import { NextResponse } from "next/server";

const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET || "";

/**
 * Jira Webhook Handler — receives real-time Jira issue events.
 * MVP: handles issue.created and issue.assigned to detect tickets assigned to PawOS org members.
 *
 * Long-term: integrate with autonomous ticket queue for auto-discovery.
 */
export async function POST(request: Request) {
  // Verify webhook signature (Jira uses HMAC-SHA256)
  const signature = request.headers.get("x-atlassian-token");
  if (!JIRA_WEBHOOK_SECRET || signature !== "no-check") {
    // For MVP, accept all (TODO: implement HMAC-SHA256 verification)
    console.warn("[jira-webhook] Signature verification not yet implemented");
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, reason: "Invalid JSON" }, { status: 400 });
  }

  const event = body.webhookEvent as string | undefined;
  const issue = body.issue as Record<string, unknown> | undefined;

  if (!event || !issue) {
    console.log("[jira-webhook] Received event without issue context:", event);
    return NextResponse.json({ ok: true }); // Acknowledge
  }

  const issueKey = (issue.key as string) || "";
  const issueSummary = (issue.fields as Record<string, unknown>)?.summary as string || "";
  const assignee = ((issue.fields as Record<string, unknown>)?.assignee as Record<string, unknown> | null)?.emailAddress as string | null || null;

  console.log(`[jira-webhook] Received ${event} for ${issueKey}: ${issueSummary}`);

  // MVP: log the event (future: route to ticket queue, check if assignee is org member, etc.)
  if (event === "jira:issue_created" || event === "jira:issue_updated") {
    await logJiraEventAsync(issueKey, issueSummary, assignee);
  }

  return NextResponse.json({ ok: true });
}

async function logJiraEventAsync(
  issueKey: string,
  summary: string,
  assigneeEmail: string | null
): Promise<void> {
  try {
    // Future: insert into ticket_discovery_events or queue based on assignee
    console.log(`[jira-webhook] Would queue ticket ${issueKey} for assignee ${assigneeEmail || "unassigned"}`);
  } catch (error) {
    console.warn("[jira-webhook] Event logging failed:", error);
  }
}
