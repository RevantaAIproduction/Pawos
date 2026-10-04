import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../lib/account/accountContext";
import type { CompanionCatalogEntry } from "../../../lib/account/companionCatalog";

/**
 * /api/dashboard and /api/public-profile routes, called directly — the same way a hand-crafted
 * request would reach them — against the in-memory backend model. `session` is who the request's
 * cookie belongs to; null is a signed-out caller.
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null }));

vi.mock("../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("../../../lib/supabase/server", () => ({ createClient: async () => state.backend.client(state.session?.id ?? null) }));
vi.mock("../../../lib/supabase/serviceClient", () => ({ createServiceClient: () => state.backend.client(null, true) }));

import { GET as getOverview } from "./overview/route";
import { GET as getIntegrations } from "./integrations/route";
import { DELETE as disconnect, POST as connect } from "./integrations/[connectorId]/route";
import { GET as getCompanionRoute, PUT as putCompanion } from "./companion/route";
import { GET as getProfile, PUT as putProfile } from "./profile/route";
import { GET as getPublicProfileRoute } from "../public-profile/[handle]/route";
import { COMPANION_CATALOG } from "../../../lib/account/companionCatalog";

const HOST = "pawos.test";
const request = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://${HOST}/api`, {
    method,
    headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const connector = (connectorId: string) => ({ params: Promise.resolve({ connectorId }) });
const handle = (value: string) => ({ params: Promise.resolve({ handle: value }) });

let goUser: User;
let proUser: User;
let proMaxUser: User;
let enterpriseMember: User;

beforeEach(() => {
  const backend = new FakeBackend();
  state.backend = backend;
  state.session = null;
  goUser = backend.addUser("go-user", { email: "go@example.com", meta: { full_name: "Go User" } });
  proUser = backend.addUser("pro-user", { subscription: { active: true, tier: "pro", expiresAt: "2026-11-01T00:00:00Z" } });
  proMaxUser = backend.addUser("promax-user", { subscription: { active: true, tier: "proMax", proMaxVariant: "5x" } });
  enterpriseMember = backend.addUser("ent-user");
  backend.joinOrganization("ent-user", { id: "org-1", name: "Acme", tier: "enterprise" }, "member");
});

describe("authentication", () => {
  it("every dashboard endpoint rejects a signed-out request with 401 and no account data", async () => {
    state.backend.addConnection("go-user", "github");
    const responses = await Promise.all([
      getOverview(),
      getIntegrations(),
      connect(request("POST"), connector("github")),
      disconnect(request("DELETE"), connector("github")),
      getCompanionRoute(),
      putCompanion(request("PUT", { companionId: "paw-default" })),
      getProfile(),
      putProfile(request("PUT", { enabled: true, handle: "ada" })),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ ok: false, code: "not_authenticated", message: "Sign in to continue." });
    }
    expect(state.backend.tables.connectivity_connections).toHaveLength(1); // the signed-out DELETE removed nothing
  });

  it("a signed-in request gets that account's overview", async () => {
    state.session = proUser;
    state.backend.addConnection("pro-user", "github");
    state.backend.usageSummary = {
      plan: { label: "Paw Pro" },
      buckets: [{ id: "b1", label: "Paw Pro", type: "monthly_plan", pcTotal: 1000, pcUsed: 250, percentUsed: 25, status: "active", resetsAt: "2026-11-01T00:00:00Z", expiresAt: "2026-11-01T00:00:00Z" }],
      weeklyPacing: null,
      limitReached: false,
    };

    const body = await (await getOverview()).json();

    expect(body.plan).toEqual({ tier: "pro", label: "Paw Pro", proMaxVariant: null, expiresAt: "2026-11-01T00:00:00Z" });
    expect(body.usage.buckets[0]).toMatchObject({ label: "Paw Pro", pcTotal: 1000, pcUsed: 250, percentUsed: 25, resetsAt: "2026-11-01T00:00:00Z" });
    expect(body.companion).toEqual({ companionId: "paw-default", displayName: "Paw", custom: false });
    expect(body.integrations).toEqual({ connected: ["github"], available: 6, total: 9 }); // Pro: everything but Linear, Jira and Bitbucket
  });

  it("a cross-site request is rejected before anything is changed", async () => {
    state.session = goUser;
    state.backend.addConnection("go-user", "github");
    const response = await disconnect(request("DELETE", undefined, { origin: "https://evil.example" }), connector("github"));

    expect(response.status).toBe(403);
    expect(state.backend.tables.connectivity_connections).toHaveLength(1);
  });
});

describe("entitlements are enforced by the API, not the page", () => {
  it("an entitled connector can be started; a locked one is refused even when called directly", async () => {
    // GitHub can be connected from the web (its connector OAuth app must be configured).
    process.env.CONNECTOR_GITHUB_CLIENT_ID = "gh-connector-id";
    process.env.CONNECTOR_GITHUB_CLIENT_SECRET = "gh-connector-secret";
    state.session = goUser;
    const github = await connect(request("POST"), connector("github"));
    expect(github.status).toBe(200);
    expect(new URL((await github.json()).connect.url).origin).toBe("https://github.com");
    delete process.env.CONNECTOR_GITHUB_CLIENT_ID;
    delete process.env.CONNECTOR_GITHUB_CLIENT_SECRET;

    const locked = await connect(request("POST"), connector("linear"));
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ ok: false, code: "not_entitled" });

    state.session = proUser;
    expect((await connect(request("POST"), connector("slack"))).status).toBe(200);
    expect((await connect(request("POST"), connector("jira"))).status).toBe(403);

    state.session = proMaxUser;
    expect((await connect(request("POST"), connector("jira"))).status).toBe(200);
  });

  it("the tier a request claims for itself is ignored", async () => {
    state.session = goUser;
    const response = await connect(request("POST", { tier: "enterprise", userId: "promax-user", organizationId: "org-1", role: "owner" }), connector("linear"));
    expect(response.status).toBe(403);
  });

  it("Enterprise access needs an active organization membership", async () => {
    state.session = enterpriseMember;
    expect((await connect(request("POST"), connector("linear"))).status).toBe(200);

    const removed = state.backend.addUser("removed-user");
    state.backend.joinOrganization("removed-user", { id: "org-1", name: "Acme", tier: "enterprise" }, "member", "removed");
    state.session = removed;
    expect((await connect(request("POST"), connector("linear"))).status).toBe(403);
  });

  it("a connector PawOS doesn't support is refused", async () => {
    state.session = proMaxUser;
    expect((await connect(request("POST"), connector("microsoftTeams"))).status).toBe(404);
    expect((await disconnect(request("DELETE"), connector("microsoftTeams"))).status).toBe(404);
  });

  it("the integrations list marks locked connectors as not entitled", async () => {
    state.session = goUser;
    const body = await (await getIntegrations()).json();
    const byId = Object.fromEntries(body.integrations.map((i: { id: string }) => [i.id, i]));

    expect(byId.github).toMatchObject({ entitled: true });
    expect(byId.slack).toMatchObject({ entitled: false, availableOn: "Paw Pro" });
    expect(byId.jira).toMatchObject({ entitled: false, availableOn: "Paw Pro Max" });
  });
});

describe("shared Web / Desktop connections", () => {
  it("a connection the desktop app stored shows as connected on the web, and web disconnect removes it for both", async () => {
    state.session = proUser;
    // What the desktop's ConnectionManagerService + ConnectivityCredentialService write on connect.
    state.backend.addConnection("pro-user", "github", "connected", { username: "octocat" });

    const before = await (await getIntegrations()).json();
    expect(before.integrations.find((i: { id: string }) => i.id === "github")).toMatchObject({ connection: "connected", accountLabel: "octocat" });

    const response = await disconnect(request("DELETE"), connector("github"));
    expect(response.status).toBe(200);
    expect((await response.json()).integration).toMatchObject({ id: "github", connection: "notConnected" });
    // The rows the desktop restores from are gone, so it can no longer use the connector either.
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
    expect(state.backend.tables.connectivity_connections).toHaveLength(0);
  });

  it("one account can never see or remove another account's connection", async () => {
    state.backend.addConnection("pro-user", "github");
    state.session = goUser;

    const body = await (await getIntegrations()).json();
    expect(body.integrations.find((i: { id: string }) => i.id === "github").connection).toBe("notConnected");
    await disconnect(request("DELETE"), connector("github"));
    expect(state.backend.tables.connectivity_connections).toHaveLength(1);
  });
});

describe("Companion", () => {
  it("returns the catalog and the current Companion", async () => {
    state.session = goUser;
    const body = await (await getCompanionRoute()).json();

    expect(body.current).toMatchObject({ companionId: "paw-default", customCompanionName: null });
    expect(body.catalog).toEqual([expect.objectContaining({ companionId: "paw-default", displayName: "Paw", available: true })]);
  });

  it("saves a change on the server and returns it on the next read", async () => {
    state.session = goUser;
    // The desktop app reported a locally-made Companion earlier.
    await state.backend.client("go-user").rpc("set_my_companion", { p_companion_id: null, p_custom_name: "Robo" });
    expect((await (await getCompanionRoute()).json()).current).toMatchObject({ companionId: null, customCompanionName: "Robo" });

    const saved = await putCompanion(request("PUT", { companionId: "paw-default" }));
    expect(saved.status).toBe(200);
    expect((await (await getCompanionRoute()).json()).current).toMatchObject({ companionId: "paw-default", customCompanionName: null });
  });

  it("Web and Desktop read and write the same record", async () => {
    state.session = goUser;
    const desktop = state.backend.client("go-user"); // the desktop app's own Supabase session

    await desktop.rpc("set_my_companion", { p_companion_id: null, p_custom_name: "Desk Buddy" });
    expect((await (await getCompanionRoute()).json()).current.customCompanionName).toBe("Desk Buddy");

    await putCompanion(request("PUT", { companionId: "paw-default" }));
    const { data } = await desktop.rpc("get_my_account_profile");
    expect(data).toMatchObject({ companionId: "paw-default", customCompanionName: null });
  });

  it("rejects an unknown Companion and a missing id", async () => {
    state.session = goUser;
    for (const body of [{ companionId: "dragon" }, { companionId: 42 }, {}, null]) {
      const response = await putCompanion(request("PUT", body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "unknown_companion" });
    }
  });

  it("rejects a Companion the account's plan doesn't include, on the API and in the database", async () => {
    const gated: CompanionCatalogEntry = { companionId: "gated", displayName: "Gated", description: "Test only", preview: "paw3d", animations: [], requiredFeature: "connectLinear" };
    (COMPANION_CATALOG as CompanionCatalogEntry[]).push(gated);
    state.backend.catalog.set("gated", "connectLinear");
    try {
      state.session = goUser;
      const refused = await putCompanion(request("PUT", { companionId: "gated" }));
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: "companion_not_available" });
      // Calling the database function directly, bypassing the API, is refused too.
      expect((await state.backend.client("go-user").rpc("set_my_companion", { p_companion_id: "gated", p_custom_name: null })).error?.message).toBe("companion_not_available");
      expect((await state.backend.client("go-user").rpc("set_user_companion_service", { p_user_id: "go-user", p_companion_id: "gated" })).error).not.toBeNull();

      state.session = proMaxUser;
      const allowed = await putCompanion(request("PUT", { companionId: "gated" }));
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).current.companionId).toBe("gated");
    } finally {
      (COMPANION_CATALOG as CompanionCatalogEntry[]).pop();
    }
  });
});

describe("public profile", () => {
  it("is 404 while off, 200 once enabled, shows the Companion, follows a Companion change, and is 404 again when disabled", async () => {
    state.session = goUser;
    const settings = (await (await getProfile()).json()).profile;
    expect(settings.publicProfileEnabled).toBe(false);
    expect((await getPublicProfileRoute(request("GET"), handle(settings.handle))).status).toBe(404);

    const enabled = await (await putProfile(request("PUT", { enabled: true, handle: "go-user", displayName: "", bio: "Building with PawOS", links: [] }))).json();
    expect(enabled.profile).toMatchObject({ publicProfileEnabled: true, handle: "go-user", publicUrl: "https://pawos.revantaai.com/u/go-user" });

    state.session = null; // the public page is read by anyone
    const visible = await getPublicProfileRoute(request("GET"), handle("go-user"));
    expect(visible.status).toBe(200);
    expect((await visible.json()).profile).toEqual({
      handle: "go-user",
      displayName: "Go User",
      avatarUrl: null,
      bio: "Building with PawOS",
      links: [],
      companion: { companionId: "paw-default", displayName: "Paw", description: expect.any(String) },
    });

    await state.backend.client("go-user").rpc("set_my_companion", { p_companion_id: null, p_custom_name: "Robo" });
    expect((await (await getPublicProfileRoute(request("GET"), handle("go-user"))).json()).profile.companion).toEqual({ companionId: null, displayName: "Robo", description: null });

    state.session = goUser;
    await putProfile(request("PUT", { enabled: false, handle: "go-user", links: [] }));
    state.session = null;
    expect((await getPublicProfileRoute(request("GET"), handle("go-user"))).status).toBe(404);
  });

  it("the public response never contains the email address, account id, plan or connections", async () => {
    state.backend.addConnection("pro-user", "github", "connected", { username: "secret-gh" });
    state.session = proUser;
    await putProfile(request("PUT", { enabled: true, handle: "pro-person", links: [{ label: "Site", url: "https://example.com" }] }));
    state.session = null;

    const text = await (await getPublicProfileRoute(request("GET"), handle("pro-person"))).text();
    for (const secret of ["pro-user", "@example.com", "secret-gh", "github", "Paw Pro", "tier", "2026-11-01"]) expect(text).not.toContain(secret);
  });

  it("a handle can't be taken from another account, and a bad handle is refused", async () => {
    state.session = goUser;
    await putProfile(request("PUT", { enabled: true, handle: "shared", links: [] }));
    state.session = proUser;

    const taken = await putProfile(request("PUT", { enabled: true, handle: "shared", links: [] }));
    expect(taken.status).toBe(409);
    expect((await putProfile(request("PUT", { enabled: true, handle: "x", links: [] }))).status).toBe(400);
    expect((await putProfile(request("PUT", { enabled: true, handle: "admin", links: [] }))).status).toBe(400);
  });

  it("a public profile can't be requested by user id", async () => {
    state.session = goUser;
    await putProfile(request("PUT", { enabled: true, handle: "go-user", links: [] }));
    state.session = null;
    expect((await getPublicProfileRoute(request("GET"), handle("go-user"))).status).toBe(200);
    expect((await getPublicProfileRoute(request("GET"), handle("go-user-id")))?.status).toBe(404);
    expect((await getPublicProfileRoute(request("GET"), handle(goUser.id + "x"))).status).toBe(404);
  });
});
