import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../account/testing/fakeBackend";
import type { AccountContext } from "../account/accountContext";
import type { AccountTier } from "../account/entitlements";
import {
  WEB_CAPABILITY_RULES,
  WEB_POLICY,
  WebCapabilityError,
  canUseWebCapability,
  requireWebCapability,
  resolveWebCapabilities,
  surfaceOfUsageCategory,
  webCapabilityStatus,
  webMessageLimitFor,
  webMessageWindowDaysFor,
  isWebUsageMetered,
  webUsageSourceFor,
  codeChangeScopeFor,
  type WebCapabilityId,
} from "./webCapabilities";

/** The Web capability policy: one server-side answer per tier, and nothing a browser can change. */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null }));

vi.mock("../account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});

import { GET as getCapabilities } from "../../app/api/web/capabilities/route";
import { WEB_MCP_READ_ALLOWLIST, authorizeWebMcpOperation } from "./webMcpPolicy";
import { remoteWorkProvider } from "./remoteWork";
import { DESKTOP_ONLY_CAPABILITIES } from "./webCapabilities";
import { getUsageActivity } from "../account/usage";

const TIERS: AccountTier[] = ["go", "pro", "proMax", "team", "enterprise", "build"];
const SRC = path.join(__dirname, "..", "..");

beforeEach(() => {
  state.backend = new FakeBackend();
  state.session = null;
});

describe("the policy", () => {
  it("keeps Paw Go at exactly four lifetime Web messages, the admin-granted tier at 12 a week, and caps no other tier by message count", () => {
    expect(WEB_POLICY.goLifetimeWebMessages).toBe(4);
    expect(webMessageLimitFor({ tier: "go" })).toBe(4);
    expect(webMessageWindowDaysFor({ tier: "go" })).toBeNull();
    expect(webMessageLimitFor({ tier: "build" })).toBe(12);
    expect(webMessageWindowDaysFor({ tier: "build" })).toBe(7);
    for (const tier of TIERS.filter((t) => t !== "go" && t !== "build")) expect(webMessageLimitFor({ tier })).toBeNull();
  });

  it("counts Web usage where Desktop counts that plan's usage, and scopes code changes by plan", () => {
    expect(webUsageSourceFor({ tier: "pro" })).toBe("planBuckets");
    expect(webUsageSourceFor({ tier: "proMax" })).toBe("planBuckets");
    expect(webUsageSourceFor({ tier: "team" })).toBe("organizationPool");
    expect(webUsageSourceFor({ tier: "enterprise" })).toBe("organizationPool");
    expect(webUsageSourceFor({ tier: "go" })).toBe("messageCap");
    expect(webUsageSourceFor({ tier: "build" })).toBe("messageCap");
    for (const tier of TIERS) expect(isWebUsageMetered({ tier })).toBe(tier === "pro" || tier === "proMax");
    for (const tier of TIERS.filter((t) => t !== "go")) expect(codeChangeScopeFor({ tier })).toBe("full");
    expect(codeChangeScopeFor({ tier: "go" })).toBe("small");
    for (const tier of TIERS) expect(webCapabilityStatus({ tier }, "web.codeChanges")).toBe("available");
  });

  it("gives every tier chat and pasted-code review", () => {
    for (const tier of TIERS) {
      expect(canUseWebCapability({ tier }, "web.chat")).toBe(true);
      expect(canUseWebCapability({ tier }, "web.codeReview")).toBe(true);
    }
  });

  it("locks file attachments on Paw Go and names the plan that includes them", () => {
    expect(webCapabilityStatus({ tier: "go" }, "web.fileUpload")).toBe("locked");
    expect(resolveWebCapabilities({ tier: "go" }).find((c) => c.id === "web.fileUpload")).toMatchObject({ status: "locked", availableOn: "Paw Pro" });
    for (const tier of TIERS.filter((t) => t !== "go")) expect(webCapabilityStatus({ tier }, "web.fileUpload")).toBe("available");
  });

  it.each<[WebCapabilityId, string]>([
    ["web.integrationContext", "desktopOnly"],
    ["web.mcpRead", "desktopOnly"],
    ["web.remoteWork", "future"],
    ["web.autonomousWork", "future"],
    ["web.browserWork", "future"],
  ])("%s is %s for every tier — no plan can buy what isn't built", (id, status) => {
    for (const tier of TIERS) {
      expect(webCapabilityStatus({ tier }, id)).toBe(status);
      expect(() => requireWebCapability({ tier }, id)).toThrow(WebCapabilityError);
    }
  });

  it("offers Continue in PawOS Desktop on every tier", () => {
    for (const tier of TIERS) expect(webCapabilityStatus({ tier }, "web.continueInDesktop")).toBe("available");
  });

  it("requireWebCapability refuses with 403 and says why", () => {
    try {
      requireWebCapability({ tier: "go" }, "web.fileUpload");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WebCapabilityError);
      expect((error as WebCapabilityError).status).toBe(403);
      expect((error as WebCapabilityError).capabilityStatus).toBe("locked");
    }
    expect(() => requireWebCapability({ tier: "enterprise" }, "web.autonomousWork")).toThrow(/isn't available on PawOS Web yet/);
    expect(() => requireWebCapability({ tier: "enterprise" }, "web.mcpRead")).toThrow(/needs the PawOS desktop app/);
  });

  it("labels usage by where it happened", () => {
    expect(surfaceOfUsageCategory("web-chat")).toBe("web");
    expect(surfaceOfUsageCategory("chat")).toBe("desktop");
    expect(surfaceOfUsageCategory("autonomous-work")).toBe("desktop");
    expect(surfaceOfUsageCategory(null)).toBe("desktop");
  });
});

describe("GET /api/web/capabilities", () => {
  it("requires sign-in", async () => {
    expect((await getCapabilities()).status).toBe(401);
  });

  it("answers from the server-resolved tier, and follows a plan change", async () => {
    state.session = state.backend.addUser("u1");
    const go = await (await getCapabilities()).json();
    expect(go.plan.tier).toBe("go");
    expect(go.limits).toEqual({ webMessageLimit: 4, maxMessageChars: 4000, maxAttachmentBytes: 60_000 });
    expect(go.capabilities.find((c: { id: string }) => c.id === "web.fileUpload").status).toBe("locked");

    state.backend.users.set("u1", { subscription: { active: true, tier: "proMax" } });
    const paid = await (await getCapabilities()).json();
    expect(paid.plan.tier).toBe("proMax");
    expect(paid.limits.webMessageLimit).toBeNull();
    expect(paid.capabilities.find((c: { id: string }) => c.id === "web.fileUpload").status).toBe("available");
    expect(paid.capabilities.find((c: { id: string }) => c.id === "web.autonomousWork").status).toBe("future");
  });

  it("an expired subscription falls back to Paw Go's limits", async () => {
    state.session = state.backend.addUser("u2", { subscription: { active: false, tier: "pro" } });
    expect((await (await getCapabilities()).json()).limits.webMessageLimit).toBe(4);
  });
});

describe("Web and Desktop activity come from the same usage records", () => {
  it("splits the server's usage events by category, per account", async () => {
    const user = state.backend.addUser("u3", { subscription: { active: true, tier: "pro" } });
    const other = state.backend.addUser("u4", { subscription: { active: true, tier: "pro" } });
    state.backend.usageHistory.set("u3", [
      { at: "2026-10-04T00:00:03Z", category: "web-chat", bucketType: "monthly_plan", pc: 1.2 },
      { at: "2026-10-04T00:00:02Z", category: "chat", bucketType: "monthly_plan", pc: 4 },
      { at: "2026-10-04T00:00:01Z", category: "web-chat", bucketType: "monthly_plan", pc: 0.8 },
    ]);

    expect(await getUsageActivity(await state.backend.accountFor(user))).toEqual({ web: { requests: 2, pc: 2 }, desktop: { requests: 1, pc: 4 }, events: 3 });
    expect(await getUsageActivity(await state.backend.accountFor(other))).toEqual({ web: { requests: 0, pc: 0 }, desktop: { requests: 0, pc: 0 }, events: 0 });
  });
});

describe("boundaries the code must keep", () => {
  const read = (relative: string) => fs.readFileSync(path.join(SRC, relative), "utf8");

  it("there is no Web wallet, Web credit or Web subscription", () => {
    const sources = ["lib/webPolicy/webCapabilities.ts", "lib/webChat/webChat.ts", "components/workspace/WorkspaceChat.tsx", "app/app/page.tsx"].map(read).join("\n");
    expect(sources).not.toMatch(/web[ _-]?(credits?|wallet|balance|subscription)\b/i);
    // Paid usage goes through the existing reservation functions and nothing else.
    expect(read("lib/webChat/webChat.ts")).toMatch(/rpc\("reserve_usage"/);
    expect(read("lib/webChat/webChat.ts")).toMatch(/rpc\("settle_usage"/);
  });

  it("every future or desktop-only capability has no Web API route", () => {
    // Each /api/web route serves display (capabilities) or an available capability:
    // handoff → web.continueInDesktop, github + changes → web.codeChanges.
    const routes = fs.readdirSync(path.join(SRC, "app", "api", "web")).sort();
    expect(routes).toEqual(["capabilities", "changes", "github", "handoff"]);
    expect(webCapabilityStatus({ tier: "go" }, "web.continueInDesktop")).toBe("available");
    expect(webCapabilityStatus({ tier: "go" }, "web.codeChanges")).toBe("available");
    for (const rule of WEB_CAPABILITY_RULES.filter((r) => r.availability !== "available")) expect(rule.tiers).toEqual([]);
  });

  it("the web-started OAuth flow never uses a loopback address", () => {
    const flow = read("lib/account/webOAuth.ts") + read("lib/account/webOAuthCallback.ts") + read("app/api/connectors/bitbucket/oauth/callback/route.ts") + read("app/api/connectors/github/callback/route.ts");
    expect(flow).not.toMatch(/127\.0\.0\.1|localhost|51900|loopback/i);
  });

  it("the browser keeps no token: the pending-send note is text and ids only", () => {
    const pending = read("lib/webChat/pendingSend.ts");
    expect(pending).not.toMatch(/localStorage/);
    const chat = read("components/workspace/WorkspaceChat.tsx");
    expect(chat).not.toMatch(/localStorage|access_token|refresh_token|Authorization/);
  });

  it("the workspace is sized for phones: dynamic viewport height, safe areas, scrollable code, 16px inputs", () => {
    const chat = read("components/workspace/WorkspaceChat.tsx");
    const shell = read("components/workspace/WorkspaceShell.tsx");
    expect(chat).toContain("100dvh");
    expect(chat).toContain("env(safe-area-inset-bottom)");
    expect(chat).toContain("overflow-x-auto");
    expect(chat).toMatch(/text-base [^"]*md:text-sm/);
    expect(chat).not.toMatch(/\b(100vh|min-h-screen|h-screen)\b/);
    expect(shell).not.toMatch(/\b(100vh|min-h-screen|h-screen)\b/);
    expect(shell).toContain("env(safe-area-inset-top)");
    expect(read("app/app/layout.tsx")).toMatch(/viewportFit: "cover"/);
  });
});

describe("MCP on the web", () => {
  it("is refused for every tier and operation while MCP runs only in the desktop app", () => {
    for (const tier of TIERS) {
      for (const access of ["read", "write"] as const) {
        expect(authorizeWebMcpOperation({ tier }, { provider: "github", tool: "get_issue", access })).toEqual({ ok: false, reason: "desktop_only" });
      }
    }
    expect(WEB_MCP_READ_ALLOWLIST).toEqual({});
  });

  it("no browser-facing route exposes MCP", () => {
    const api = fs.readdirSync(path.join(SRC, "app", "api"), { recursive: true }).map(String);
    expect(api.filter((entry) => /mcp/i.test(entry))).toEqual([]);
  });
});

describe("FUTURE capabilities are not faked", () => {
  it("there is no remote-work runtime, and Autonomous/Remote/Browser work stay 'future' with no route", () => {
    expect(remoteWorkProvider).toBeNull();
    for (const id of ["web.remoteWork", "web.autonomousWork", "web.browserWork"] as const) {
      for (const tier of TIERS) expect(webCapabilityStatus({ tier }, id)).toBe("future");
    }
    const api = fs.readdirSync(path.join(SRC, "app", "api"), { recursive: true }).map(String);
    expect(api.filter((entry) => /remote-work|autonomous|browser-work/i.test(entry))).toEqual([]);
  });

  it("the Web chat tells the model everything only PawOS Desktop can do", () => {
    const chat = fs.readFileSync(path.join(SRC, "lib", "webChat", "webChat.ts"), "utf8");
    expect(chat).toContain("DESKTOP_ONLY_CAPABILITIES");
    expect(DESKTOP_ONLY_CAPABILITIES.map((c) => c.id)).toEqual(expect.arrayContaining(["desktop.filesystem", "desktop.terminal", "desktop.tests", "desktop.autonomousWork"]));
  });
});

describe("OAuth on the web and on phones", () => {
  const read = (relative: string) => fs.readFileSync(path.join(SRC, relative), "utf8");

  it("the web flow's redirect is the hosted HTTPS callback, never a desktop loopback", () => {
    const oauth = read("lib/account/webOAuth.ts");
    for (const uri of oauth.match(/redirectUri: "([^"]+)"/g) ?? []) expect(uri).toMatch(/redirectUri: "https:\/\/pawos\.revantaai\.com\//);
    expect(oauth).not.toMatch(/127\.0\.0\.1|localhost/);
  });

  it("returning from the provider re-reads the server's connection state, including from the back/forward cache", () => {
    const callback = read("lib/account/webOAuthCallback.ts");
    expect(callback).toMatch(/\/dashboard\/integrations\?integration=\$\{connectorId\}&status=\$\{status\}/);
    for (const route of ["app/api/connectors/bitbucket/oauth/callback/route.ts", "app/api/connectors/github/callback/route.ts"]) expect(read(route)).toContain("handleConnectorCallback");
    const list = read("app/dashboard/integrations/IntegrationsList.tsx");
    expect(list).toMatch(/pageshow/);
    expect(list).toMatch(/router\.refresh\(\)/);
    expect(read("app/dashboard/integrations/page.tsx")).toMatch(/export const dynamic|getAccountContext/);
  });

  it("the service worker never answers API requests from a cache", () => {
    const sw = fs.readFileSync(path.join(SRC, "..", "public", "sw.js"), "utf8");
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
  });
});
