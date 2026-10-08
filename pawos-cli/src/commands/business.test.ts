import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { CAPABILITIES, harness, integration, reply } from "../testing/harness";
import { PawosApiError } from "../shared";
import { isPlanRefusal, renderRefusal } from "../ui/account";
import { QUESTION } from "./interactive";

/**
 * The account's plan, usage, credits and entitlements. The CLI is a display for what PawOS decides:
 * it shows what the server returned, shows the server's refusals in the server's words, and has no
 * rule of its own that could allow something PawOS refused.
 */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const HOME = "C:\\Users\\APPLE";
const NOT_GIT = { kind: "notGit" } as const;
const bucket = (overrides: Record<string, unknown>) => ({ id: "b", label: "Monthly allowance", type: "plan_allowance", pcTotal: 6000, pcUsed: 1500, resetsAt: "2026-11-01T00:00:00.000Z", expiresAt: null, ...overrides });
const usage = (buckets: unknown[], overrides: Record<string, unknown> = {}) => ({ unit: "PC", buckets, weeklyPacing: null, limitReached: false, limitResetsAt: null, ...overrides }) as never;
const rowOf = (text: string, label: string) => text.split("\n").find((line) => line.trimStart().startsWith(label));
const sources = () => {
  const root = path.join(__dirname, "..");
  return fs
    .readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.includes("testing"))
    .map((file) => ({ file: file.replace(/\\/g, "/"), source: fs.readFileSync(path.join(root, file), "utf8") }));
};

describe("plans", () => {
  it.each([
    ["go", "Paw Go"],
    ["pro", "Paw Pro"],
    ["pro_max", "Paw Pro Max"],
    ["team", "Paw Team"],
    ["enterprise", "Paw Enterprise"],
    ["something_new", "Paw Something New"],
  ])("the plan shown is the one PawOS resolved (%s → %s), with no plan table in the CLI", async (tier, label) => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.plan = { tier, label };
    expect(await runCli(["status"], h.ctx)).toBe(0);
    expect(rowOf(h.output(), "Account")).toMatch(new RegExp(`alice@example\\.com · ${label}$`));
  });

  it("the CLI holds no plan names, prices or limits of its own", () => {
    for (const { source } of sources()) {
      expect(source).not.toMatch(/Paw Go|Paw Pro|Pro Max|Enterprise|\$\s?\d|₹|per month|\/mo\b/);
      expect(source).not.toMatch(/tier\s*===|plan\.tier|planTier/);
    }
  });

  it("a plan PawOS didn't name is not guessed", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.capabilitiesAnswer = reply({ plan: null, capabilities: CAPABILITIES });
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Account")).toMatch(/Account\s+alice@example\.com$/);
  });
});

describe("entitlements", () => {
  const withCapability = (id: string, status: string, availableOn: string | null = null) => reply({ plan: { tier: "go", label: "Paw Go" }, capabilities: CAPABILITIES.map((capability) => (capability.id === id ? { ...capability, status, availableOn } : capability)) });

  it("feature allowed, denied and not offered are each reported as PawOS reports them", async () => {
    for (const [status, availableOn, shown] of [
      ["available", null, "available"],
      ["locked", "Paw Pro", "not included in your plan (available on Paw Pro)"],
      ["desktopOnly", null, "PawOS Desktop only"],
      ["future", null, "not available here yet"],
    ] as const) {
      const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
      h.server.capabilitiesAnswer = withCapability("web.codeChanges", status, availableOn);
      await runCli(["status"], h.ctx);
      expect(rowOf(h.output(), "Code changes")).toMatch(new RegExp(`Code changes\\s+${shown.replace(/[()]/g, "\\$&")}$`));
    }
  });

  it("an entitlement state the CLI doesn't know is left out, never shown as allowed", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.capabilitiesAnswer = withCapability("web.codeChanges", "trial_maybe");
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Code changes")).toBeUndefined();
    expect(h.output()).not.toMatch(/Code changes\s+available/);
  });

  it("a capability PawOS didn't list has no row", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.capabilitiesAnswer = reply({ plan: { tier: "go", label: "Paw Go" }, capabilities: [] });
    await runCli(["status"], h.ctx);
    for (const label of ["Code changes", "Autonomous Work", "Connected tools"]) expect(rowOf(h.output(), label)).toBeUndefined();
  });

  it("a locked feature is still asked of PawOS, and PawOS's refusal is what the user sees", async () => {
    const h = start({ signedIn: true, answers: ["hello", null], cwd: HOME, local: NOT_GIT });
    h.server.plan = { tier: "go", label: "Paw Go" };
    h.server.chatReplies = [reply({ code: "capability_locked", message: "Chat isn't included in your plan." }, 403)];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("This isn't available on your current PawOS plan.");
    expect(output).toContain("Chat isn't included in your plan.");
    expect(output).toContain("Plan: Paw Go");
    expect(output).toContain("Open PawOS to view available options:");
    expect(output.split("\n")).toContain("https://pawos.test/pricing");
    expect(output.lastIndexOf(QUESTION)).toBeGreaterThan(output.indexOf("https://pawos.test/pricing")); // back at the prompt
    expect(h.server.chats()).toHaveLength(1); // not retried, not re-sent another way
    expect(h.server.recovers()).toHaveLength(0);
  });
});

describe("usage", () => {
  it("usage below the limit: the server's own figures, in its own unit", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.usage = usage([bucket({})]);
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Usage")).toMatch(/Usage\s+Monthly allowance: 1,500 \/ 6,000 PC, until 2026-11-01$/);
    expect(h.output()).not.toContain("Limit reached");
  });

  it("usage at the limit, and beyond it: shown as PawOS reports it", async () => {
    for (const used of [6000, 6400]) {
      const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
      h.server.usage = usage([bucket({ pcUsed: used })], { limitReached: true, limitResetsAt: "2026-11-01T00:00:00.000Z" });
      await runCli(["status"], h.ctx);
      expect(h.output()).toContain(`Monthly allowance: ${used.toLocaleString("en-US")} / 6,000 PC`);
      expect(h.output()).toMatch(/Limit reached, resets 2026-11-01/);
    }
  });

  it("the limit is the server's flag, not arithmetic done here", async () => {
    const full = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    full.server.usage = usage([bucket({ pcUsed: 6000 })]); // full, but PawOS has not said the limit is reached
    await runCli(["status"], full.ctx);
    expect(full.output()).not.toContain("Limit reached");

    const pace = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    pace.server.usage = usage([bucket({})], { weeklyPacing: { percentUsed: 100, reached: true, resetsAt: "2026-10-12T00:00:00.000Z" } });
    await runCli(["status"], pace.ctx);
    expect(pace.output()).toContain("This week's pace reached, resets 2026-10-12");
  });

  it("no fake usage: when PawOS reports none, or can't be asked, there is no usage row at all", async () => {
    const none = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    await runCli(["status"], none.ctx);
    const failing = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    failing.server.overviewAnswer = reply({ code: "failed", message: "boom" }, 500);
    expect(await runCli(["status"], failing.ctx)).toBe(0);
    const malformed = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    malformed.server.usage = usage([bucket({ pcUsed: "lots", pcTotal: null })]);
    await runCli(["status"], malformed.ctx);
    for (const h of [none, failing, malformed]) {
      expect(rowOf(h.output(), "Usage")).toBeUndefined();
      expect(rowOf(h.output(), "Credits")).toBeUndefined();
      expect(h.output()).not.toMatch(/\d+ \/ \d+|\bPC\b|%/);
    }
  });

  it("usage limit reached while chatting: said clearly, with the plan and where to look, then the prompt", async () => {
    const h = start({ signedIn: true, answers: ["explain closures", "/status", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ code: "usage_limit_reached", message: "You've used your plan's allowance. It resets on November 1." }, 402)];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("PawOS usage limit reached.");
    expect(output).toContain("You've used your plan's allowance. It resets on November 1.");
    expect(output).toContain("Plan: Paw Pro");
    expect(output.split("\n")).toContain("https://pawos.test/pricing");
    expect(output).not.toMatch(/Error|stack|402|usage_limit_reached/); // no raw backend detail
    expect(h.server.chats()).toHaveLength(1);
    expect(output).toContain("PawOS Account"); // the session carried on
  });

  it("the free-message limit is reported the same way", async () => {
    const h = start({ signedIn: true, answers: ["hi", null], cwd: HOME, local: NOT_GIT });
    h.server.plan = { tier: "go", label: "Paw Go" };
    h.server.chatReplies = [reply({ code: "message_limit_reached", message: "You've reached today's message limit." }, 402)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS usage limit reached.");
    expect(h.output()).toContain("You've reached today's message limit.");
    expect(h.output()).toContain("Plan: Paw Go");
  });

  it("when PawOS couldn't check usage, it is not presented as a limit and nothing is sent again", async () => {
    const h = start({ signedIn: true, answers: ["hi", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ code: "usage_limit_reached", message: "Your organization's usage couldn't be checked. Please try again." }, 503)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Your organization's usage couldn't be checked. Please try again.");
    expect(h.server.chats()).toHaveLength(1);
  });
});

describe("credits", () => {
  it("credits are shown only when PawOS reports them, as the remaining amount it reports", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.usage = usage([bucket({}), bucket({ id: "c1", label: "Extra usage", type: "purchased_credits", pcTotal: 4500, pcUsed: 500, resetsAt: null })]);
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Credits")).toMatch(/Credits\s+4,000 PC$/);
    expect(h.output()).not.toContain("Extra usage:"); // not repeated as a plan allowance
  });

  it("no credits reported: no Credits row, and no zero invented", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    h.server.usage = usage([bucket({})]);
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Credits")).toBeUndefined();
  });

  it("insufficient credits: PawOS refuses the code task, nothing is charged or retried from here", async () => {
    const h = start({ signedIn: true, answers: ["fix the login bug", null] });
    h.server.sends = [reply({ code: "usage_limit_reached", message: "You don't have enough credits for this change." }, 402)];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("You don't have enough credits for this change.");
    expect(output).toContain("Plan: Paw Pro");
    expect(output).toContain("https://pawos.test/pricing");
    expect(h.server.starts()).toHaveLength(1);
    expect(output.lastIndexOf(QUESTION)).toBeGreaterThan(output.indexOf("enough credits"));
  });

  it("the CLI never spends, grants or adjusts anything: it has no such request", async () => {
    const h = start({ signedIn: true, answers: ["hello", "/status", "/connections", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    // Apart from renewing its own session, the only thing it ever sends is the user's message.
    const writes = h.server.calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/api/auth/device/")).map((call) => call.path);
    expect([...new Set(writes)]).toEqual(["/api/web-chat/messages"]);
    for (const call of h.server.calls) expect(JSON.stringify(call.body ?? {})).not.toMatch(/plan|tier|credit|usage|entitle|seat|price|amount/i);
  });
});

describe("Autonomous Work (ATS)", () => {
  it("is reported exactly as PawOS reports it, and the CLI has no way to start it", async () => {
    const h = start({ signedIn: true, cwd: HOME, local: NOT_GIT });
    await runCli(["status"], h.ctx);
    expect(rowOf(h.output(), "Autonomous Work")).toMatch(/Autonomous Work\s+not available here yet$/);
    for (const { source } of sources()) expect(source).not.toMatch(/autonomous-ticket|\/api\/ats|ticket_balance|ticketBalance|solve-ticket/i);
  });

  it("an ATS request is a message to PawOS; a refusal there is shown and nothing runs", async () => {
    const h = start({ signedIn: true, answers: ["solve ticket ENG-142 autonomously", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ chatId: "c", reply: "Autonomous Work runs in PawOS Desktop.", recovered: false, requiresDesktop: true })];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Autonomous Work runs in PawOS Desktop.");
    expect(h.output()).toContain("Nothing was done from here.");
    expect(h.server.starts()).toHaveLength(0);
  });
});

describe("billing", () => {
  it("the upgrade destination is PawOS's own plans page — the CLI takes no payment and opens nothing", () => {
    const lines = renderRefusal(new PawosApiError("rejected", "Limit reached.", 402, "usage_limit_reached"), "Paw Pro", "https://pawos.revantaai.com/");
    const text = lines.map((entry) => entry.map((part) => (typeof part === "string" ? part : part.text)).join("")).join("\n");
    expect(text).toContain("https://pawos.revantaai.com/pricing");
    for (const { source } of sources()) {
      expect(source).not.toMatch(/razorpay|stripe|rzp_|sk_live|sk_test|card number|cvv|checkout\.js|payment_id|service_role/i);
      expect(source).not.toMatch(/\bopen\(|start "" |xdg-open|shell\.openExternal/);
    }
  });

  it("an unsafe plans address is never rendered as a link", () => {
    const lines = renderRefusal(new PawosApiError("rejected", "Limit reached.", 402, "usage_limit_reached"), null, "javascript:alert(1)");
    const text = JSON.stringify(lines);
    expect(text).not.toContain("javascript:");
    expect(text).not.toContain("Open PawOS to view available options");
  });

  it("only plan, usage and credit refusals are framed as such", () => {
    expect(isPlanRefusal(new PawosApiError("rejected", "x", 402, null))).toBe(true);
    expect(isPlanRefusal(new PawosApiError("forbidden", "x", 403, "capability_locked"))).toBe(true);
    expect(isPlanRefusal(new PawosApiError("forbidden", "x", 403, "forbidden"))).toBe(false);
    expect(isPlanRefusal(new PawosApiError("server", "x", 500, "failed"))).toBe(false);
    expect(isPlanRefusal(new PawosApiError("network", "x"))).toBe(false);
    expect(isPlanRefusal(new Error("usage_limit_reached"))).toBe(false);
  });
});

describe("organization", () => {
  it.each([
    ["seat_required", "Your organization hasn't assigned you a seat. Ask an admin to add you."],
    ["forbidden", "Only an organization admin can do that."],
    ["organization_suspended", "Your organization's subscription is inactive."],
  ])("an organization refusal (%s) is shown in PawOS's words, and the prompt returns", async (code, message) => {
    const h = start({ signedIn: true, answers: ["hello", null], cwd: HOME, local: NOT_GIT });
    h.server.plan = { tier: "team", label: "Paw Team" };
    h.server.chatReplies = [reply({ code, message }, 403)];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain(message);
    expect(h.output()).not.toContain(code);
    expect(h.output().lastIndexOf(QUESTION)).toBeGreaterThan(h.output().indexOf(message));
    expect(h.server.chats()).toHaveLength(1);
  });

  it("a connector an organization's plan doesn't include can't be connected by asking differently", async () => {
    const h = start({ signedIn: true, answers: ["/connect linear", "/connect LINEAR", null], cwd: HOME, local: NOT_GIT });
    h.server.integrations = [integration("linear", "Linear", { entitled: false, availableOn: "Paw Pro Max" })];
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("Open PawOS Integrations to connect Linear");
    expect(h.output()).not.toContain("✓ Linear");
  });
});

describe("security: the server is the authority", () => {
  it("nothing local can change what the account may do: no flag, environment variable or file is read for it", () => {
    for (const { file, source } of sources()) {
      expect(source).not.toMatch(/PAWOS_(PLAN|TIER|CREDITS|USAGE|ENTITLE|BYPASS|UNLOCK)|--plan|--tier|--force-unlock|skipLimit/i);
      // "bypass" appears in exactly one place: as a name people may type for the mode that doesn't ask
      // before a code change (commands/workspace.ts). It is about this CLI asking, not about what the
      // account may do — see "a mode never changes what PawOS allows" in workspace.test.ts.
      if (file !== "commands/workspace.ts") expect(source).not.toMatch(/bypass/i);
    }
  });

  it("no token, payment detail or raw server object reaches the screen", async () => {
    const h = start({ signedIn: true, answers: ["hello", "/status", "/connections", null], cwd: HOME, local: NOT_GIT });
    h.server.usage = usage([bucket({}), bucket({ type: "purchased_credits", label: "Extra usage", pcTotal: 1000, pcUsed: 0 })]);
    h.server.chatReplies = [reply({ code: "usage_limit_reached", message: "Limit reached." }, 402)];
    await runCli([], h.ctx);
    const screen = h.raw();
    for (const secret of ["access-", "refresh-", "Bearer ", ".jwt.", "plan_allowance", "purchased_credits", '{"', "reservation"]) expect(screen).not.toContain(secret);
  });

  it("a refusal's text can't inject control sequences or a fake link", async () => {
    const esc = String.fromCharCode(27);
    const h = start({ signedIn: true, answers: ["hello", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [reply({ code: "usage_limit_reached", message: `Limit${esc}]8;;https://evil.example${esc}\\click${esc}]8;;${esc}\\ reached` }, 402)];
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain("evil.example" + esc);
    expect(h.raw()).not.toContain(`${esc}]8;;https://evil.example`);
  });
});
