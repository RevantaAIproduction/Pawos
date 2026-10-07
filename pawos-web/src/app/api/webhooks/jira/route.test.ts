import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/** A Jira event must be proven with the webhook secret before anything about it is read or logged. */
const SECRET = "jira-webhook-secret";
const EVENT = JSON.stringify({ webhookEvent: "jira:issue_created", issue: { key: "PAW-12", fields: { summary: "Private customer summary", assignee: { emailAddress: "dev@customer.test" } } } });
const sign = (body: string, secret = SECRET) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
const deliver = (body: string, headers: Record<string, string> = {}) => POST(new Request("https://pawos.revantaai.com/api/webhooks/jira", { method: "POST", headers, body }));

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.JIRA_WEBHOOK_SECRET = SECRET;
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/jira", () => {
  it("accepts an event signed with the webhook secret", async () => {
    const response = await deliver(EVENT, { "x-hub-signature": sign(EVENT) });
    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith("[jira-webhook] verified jira:issue_created for PAW-12");
  });

  it("refuses an unsigned request and reads nothing from it", async () => {
    const response = await deliver(EVENT);
    expect(response.status).toBe(401);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["a signature made with another secret", sign(EVENT, "attacker-secret")],
    ["a signature for a different body", sign(EVENT.replace("PAW-12", "PAW-13"))],
    ["a malformed signature", "sha256=nothex"],
    ["the wrong algorithm", `sha1=${"a".repeat(40)}`],
    ["an empty signature", ""],
  ])("refuses %s", async (_name, signature) => {
    const response = await deliver(EVENT, { "x-hub-signature": signature });
    expect(response.status).toBe(401);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses the old bypass header", async () => {
    const response = await deliver(EVENT, { "x-atlassian-token": "no-check" });
    expect(response.status).toBe(401);
  });

  it("refuses everything when no secret is configured", async () => {
    delete process.env.JIRA_WEBHOOK_SECRET;
    const response = await deliver(EVENT, { "x-hub-signature": sign(EVENT, "") });
    expect(response.status).toBe(503);
    expect(log).not.toHaveBeenCalled();
  });

  it("never logs the issue summary or the assignee's email", async () => {
    await deliver(EVENT, { "x-hub-signature": sign(EVENT) });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("Private customer summary");
    expect(logged).not.toContain("dev@customer.test");
  });

  it("acknowledges a signed event it does not handle, without logging it", async () => {
    const other = JSON.stringify({ webhookEvent: "jira:issue_deleted", issue: { key: "PAW-12" } });
    const response = await deliver(other, { "x-hub-signature": sign(other) });
    expect(response.status).toBe(200);
    expect(log).not.toHaveBeenCalled();
  });
});
