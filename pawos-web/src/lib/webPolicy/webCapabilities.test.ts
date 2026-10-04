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
import { getUsageActivity } from "../account/usage";

const TIERS: AccountTier[] = ["go", "pro", "proMax", "team", "enterprise", "build"];
const SRC = path.join(__dirname, "..", "..");

beforeEach(() => {
  state.backend = new FakeBackend();
  state.session = null;
});

describe("the policy", () => {
  it("keeps Paw Go at exactly four lifetime Web messages and caps no other tier by message count", () => {
    expect(WEB_POLICY.goLifetimeWebMessages).toBe(4);
    expect(webMessageLimitFor({ tier: "go" })).toBe(4);
    for (const tier of TIERS.filter((t) => t !== "go")) expect(webMessageLimitFor({ tier })).toBeNull();
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
    ["web.continueInDesktop", "future"],
    ["web.remoteWork", "future"],
    ["web.autonomousWork", "future"],
    ["web.browserWork", "future"],
  ])("%s is %s for every tier — no plan can buy what isn't built", (id, status) => {
    for (const tier of TIERS) {
      expect(webCapabilityStatus({ tier }, id)).toBe(status);
      expect(() => requireWebCapability({ tier }, id)).toThrow(WebCapabilityError);
    }
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
    const routes = fs.readdirSync(path.join(SRC, "app", "api", "web"));
    expect(routes).toEqual(["capabilities"]);
    for (const rule of WEB_CAPABILITY_RULES.filter((r) => r.availability !== "available")) expect(rule.tiers).toEqual([]);
  });

  it("the web-started OAuth flow never uses a loopback address", () => {
    const flow = read("lib/account/webOAuth.ts") + read("app/api/connectors/bitbucket/oauth/callback/route.ts");
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
