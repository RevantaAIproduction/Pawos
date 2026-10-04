import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { CONNECTOR_REQUIRED_FEATURE, TIER_CONNECTOR_FEATURES, lowestTierWithFeature, type AccountTier } from "./entitlements";
import { COMPANION_CATALOG, DEFAULT_COMPANION_ID } from "./companionCatalog";
import { INTEGRATIONS, INTEGRATION_MCP_ACCESS, disconnectIntegration, listIntegrations } from "./integrations";
import { getMyProfile, getPublicProfile, parsePublicProfileInput, ProfileError } from "./profile";
import { FakeBackend } from "./testing/fakeBackend";

const repoRoot = path.join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

describe("entitlement mirror stays identical to the desktop entitlement system", () => {
  const source = read("src/main/billing/EntitlementService.ts");

  /** Resolves a `const X_FEATURES: FeatureId[] = [...]` block, following `...OTHER_FEATURES` spreads. */
  function desktopFeatures(name: string): string[] {
    const block = source.match(new RegExp(`const ${name}: FeatureId\\[\\] = \\[([\\s\\S]*?)\\];`));
    if (!block) throw new Error(`${name} not found in EntitlementService.ts`);
    const features: string[] = [];
    for (const spread of block[1].matchAll(/\.\.\.(\w+_FEATURES)/g)) features.push(...desktopFeatures(spread[1]));
    for (const literal of block[1].matchAll(/'(\w+)'/g)) features.push(literal[1]);
    return features;
  }

  const DESKTOP_BLOCK: Record<AccountTier, string> = {
    go: "GO_FEATURES",
    pro: "PRO_FEATURES",
    proMax: "PRO_MAX_FEATURES",
    team: "TEAM_FEATURES",
    enterprise: "ENTERPRISE_FEATURES",
    build: "BUILD_FEATURES",
  };
  const webConnectorFeatures = Object.values(CONNECTOR_REQUIRED_FEATURE);

  it.each(Object.keys(DESKTOP_BLOCK) as AccountTier[])("%s grants the same connectors on web as on desktop", (tier) => {
    const desktop = desktopFeatures(DESKTOP_BLOCK[tier]).filter((feature) => (webConnectorFeatures as string[]).includes(feature));
    expect([...new Set(TIER_CONNECTOR_FEATURES[tier])].sort()).toEqual([...new Set(desktop)].sort());
  });

  it("maps each connector to the same FeatureId as the desktop's CONNECTOR_REQUIRED_FEATURE", () => {
    const types = read("src/shared/connectivity/ConnectivityTypes.ts");
    for (const [connectorId, feature] of Object.entries(CONNECTOR_REQUIRED_FEATURE)) {
      expect(types).toMatch(new RegExp(`\\b${connectorId}: '${feature}'`));
    }
  });

  it("lists only connectors the desktop app registers", () => {
    const main = read("src/main/main.ts");
    for (const integration of INTEGRATIONS) expect(main).toMatch(new RegExp(`${integration.id}ConnectorSDK`, "i"));
    expect(INTEGRATIONS.map((i) => i.id)).not.toContain("microsoftTeams");
  });

  it("shows the same MCP access model per connector as the desktop MCP provider definitions", () => {
    const providers = read("src/shared/connectivity/McpProviders.ts");
    const desktop = Object.fromEntries([...providers.matchAll(/connectorId: '(\w+)',[\s\S]*?auth: '(\w+)'/g)].map((m) => [m[1], m[2]]));
    expect(INTEGRATION_MCP_ACCESS).toEqual(desktop);
    for (const id of Object.keys(INTEGRATION_MCP_ACCESS)) expect(INTEGRATIONS.map((i) => i.id)).toContain(id);
  });

  it("names the lowest plan that unlocks a connector", () => {
    expect(lowestTierWithFeature("connectGithub")).toBe("go");
    expect(lowestTierWithFeature("connectSlack")).toBe("pro");
    expect(lowestTierWithFeature("connectLinear")).toBe("proMax");
  });
});

describe("Companion catalog matches the backend catalog", () => {
  const migration = read("supabase/migrations/20261004000000_account_profile_companion.sql");

  it("has exactly the ids the migration seeds, with the same entitlement requirement", () => {
    const seeded = [...migration.matchAll(/values \('([\w-]+)', (null|'\w+')\)/g)].map((m) => ({ id: m[1], feature: m[2] === "null" ? null : m[2].slice(1, -1) }));
    expect(seeded).toEqual(COMPANION_CATALOG.map((entry) => ({ id: entry.companionId, feature: entry.requiredFeature })));
  });

  it("uses the desktop app's id for the official Paw companion", () => {
    expect(read("src/renderer/companion/manager/CompanionProfileTypes.ts")).toContain(`DEFAULT_PAW_ID = '${DEFAULT_COMPANION_ID}'`);
  });

  it("every entry carries the stable metadata the pages rely on", () => {
    for (const entry of COMPANION_CATALOG) {
      expect(entry.companionId).toMatch(/^[a-z0-9-]+$/);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

describe("account tier is resolved from server records", () => {
  it.each([
    ["no subscription", {}, "go"],
    ["an active Pro subscription", { subscription: { active: true, tier: "pro" } }, "pro"],
    ["an active Pro Max subscription", { subscription: { active: true, tier: "proMax", proMaxVariant: "5x" } }, "proMax"],
    ["an inactive subscription", { subscription: { active: false, tier: "proMax" } }, "go"],
    ["an active Build grant without a paid plan", { buildStatus: "active" }, "build"],
    ["a paid plan wins over an active Build grant, as on Desktop", { subscription: { active: true, tier: "pro" }, buildStatus: "active" }, "pro"],
    ["an expired Build grant", { buildStatus: "expired" }, "go"],
  ] as const)("%s → %s", async (_label, state, expected) => {
    const backend = new FakeBackend();
    const account = await backend.accountFor(backend.addUser("u1", state as never));
    expect(account.tier).toBe(expected);
  });

  it("an organization plan wins over an active Build grant, as on Desktop", async () => {
    const backend = new FakeBackend();
    const user = backend.addUser("student", { buildStatus: "active" });
    backend.joinOrganization("student", { id: "org-2", name: "Uni", tier: "team" }, "member");
    expect((await backend.accountFor(user)).tier).toBe("team");
  });

  it("internal test accounts get their test-tier override, as on Desktop; nobody else does", async () => {
    const backend = new FakeBackend();
    const admin = backend.addUser("admin", { email: "founder@revantaai.com", subscription: { active: true, tier: "pro" } });
    const customer = backend.addUser("customer", { email: "someone@example.com", subscription: { active: true, tier: "pro" } });
    backend.tables.admin_test_tier_overrides = [
      { user_id: "admin", organization_id: null, real_tier: "pro", override_tier: "enterprise" },
      { user_id: "customer", organization_id: null, real_tier: "pro", override_tier: "enterprise" },
    ];
    expect((await backend.accountFor(admin)).tier).toBe("enterprise");
    expect((await backend.accountFor(customer)).tier).toBe("pro");
    // An override to Paw Go lets an active Build grant apply, exactly as Desktop's effectiveTier().
    backend.tables.admin_test_tier_overrides[0].override_tier = "go";
    backend.users.set("admin", { ...backend.users.get("admin"), buildStatus: "active" });
    expect((await backend.accountFor(admin)).tier).toBe("build");
    // An unknown tier in the row is ignored.
    backend.tables.admin_test_tier_overrides[0].override_tier = "ultra";
    expect((await backend.accountFor(admin)).tier).toBe("pro");
  });

  it("Team / Enterprise come only from an active organization membership", async () => {
    const backend = new FakeBackend();
    const member = backend.addUser("member");
    const invited = backend.addUser("invited");
    const outsider = backend.addUser("outsider");
    backend.joinOrganization("member", { id: "org-1", name: "Acme", tier: "enterprise" }, "member");
    backend.joinOrganization("invited", { id: "org-1", name: "Acme", tier: "enterprise" }, "member", "invited");

    expect((await backend.accountFor(member)).tier).toBe("enterprise");
    expect((await backend.accountFor(member)).organizations).toEqual([{ id: "org-1", name: "Acme", tier: "enterprise", role: "member" }]);
    expect((await backend.accountFor(invited)).tier).toBe("go");
    expect((await backend.accountFor(outsider)).tier).toBe("go");
  });
});

describe("integrations", () => {
  it("shows connection state and entitlement per connector for the signed-in account", async () => {
    const backend = new FakeBackend();
    const user = backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
    backend.addConnection("pro-user", "github", "connected", { username: "octocat" });
    backend.addConnection("pro-user", "slack", "needsReauth", { teamName: "Acme" });
    backend.addConnection("someone-else", "gitlab");

    const integrations = await listIntegrations(await backend.accountFor(user));
    const byId = Object.fromEntries(integrations.map((i) => [i.id, i]));

    expect(byId.github).toMatchObject({ entitled: true, connection: "connected", accountLabel: "octocat" });
    expect(byId.slack).toMatchObject({ entitled: true, connection: "needsReauth" });
    expect(byId.gitlab).toMatchObject({ entitled: true, connection: "notConnected" }); // another account's row is invisible
    expect(byId.linear).toMatchObject({ entitled: false, connection: "notConnected", availableOn: "Paw Pro Max" });
  });

  it("a connection made on desktop under a higher tier is inert, not shown as connected, after a downgrade", async () => {
    const backend = new FakeBackend();
    const user = backend.addUser("downgraded");
    backend.addConnection("downgraded", "linear");

    const linear = (await listIntegrations(await backend.accountFor(user))).find((i) => i.id === "linear");
    expect(linear).toMatchObject({ entitled: false, connection: "notConnected" });
  });

  it("disconnect removes the account's own credential and connection, and nobody else's", async () => {
    const backend = new FakeBackend();
    const user = backend.addUser("u1");
    backend.addConnection("u1", "github");
    backend.addConnection("u2", "github");

    await disconnectIntegration(await backend.accountFor(user), "github");

    expect(backend.tables.connectivity_connections).toEqual([expect.objectContaining({ user_id: "u2" })]);
    expect(backend.tables.connectivity_credentials).toEqual([expect.objectContaining({ user_id: "u2" })]);
  });
});

describe("public profile", () => {
  it("is not exposed until the owner turns it on, and disappears again when turned off", async () => {
    const backend = new FakeBackend();
    const owner = backend.addUser("owner", { email: "private@example.com", meta: { full_name: "Ada Lovelace", avatar_url: "https://img.example/ada.png" } });
    const ownerClient = backend.client(owner.id);
    const anonymous = backend.client(null);
    const { handle } = await getMyProfile(ownerClient);

    expect(await getPublicProfile(anonymous, handle)).toBeNull();

    await ownerClient.rpc("update_my_public_profile", { p_enabled: true, p_handle: "ada", p_display_name: null, p_bio: "Hi", p_links: [{ label: "Site", url: "https://ada.dev" }] });
    expect(await getPublicProfile(anonymous, "ada")).toEqual({
      handle: "ada",
      displayName: "Ada Lovelace",
      avatarUrl: "https://img.example/ada.png",
      bio: "Hi",
      links: [{ label: "Site", url: "https://ada.dev" }],
      companionId: "paw-default",
      customCompanionName: null,
    });
    expect(await getPublicProfile(anonymous, handle)).toBeNull(); // the old handle no longer resolves

    await ownerClient.rpc("update_my_public_profile", { p_enabled: false, p_handle: "ada", p_display_name: null, p_bio: "Hi", p_links: [] });
    expect(await getPublicProfile(anonymous, "ada")).toBeNull();
  });

  it("never carries the email address, user id or anything outside the public whitelist", async () => {
    const backend = new FakeBackend();
    const owner = backend.addUser("owner-id-123", { email: "private@example.com", meta: { full_name: "Ada" } });
    backend.addConnection(owner.id, "github", "connected", { username: "secret-gh" });
    await backend.client(owner.id).rpc("update_my_public_profile", { p_enabled: true, p_handle: "ada", p_display_name: null, p_bio: null, p_links: [] });

    const profile = await getPublicProfile(backend.client(null), "ada");
    const serialized = JSON.stringify(profile);

    expect(Object.keys(profile ?? {}).sort()).toEqual(["avatarUrl", "bio", "companionId", "customCompanionName", "displayName", "handle", "links"]);
    for (const secret of ["private@example.com", "owner-id-123", "secret-gh", "github"]) expect(serialized).not.toContain(secret);
  });

  it("drops fields the database should never send, even if it did", async () => {
    const leaky = { rpc: async () => ({ data: { handle: "ada", displayName: "Ada", email: "private@example.com", user_id: "u1", avatarUrl: "javascript:alert(1)", links: [{ label: "x", url: "http://insecure" }] }, error: null }) };
    const profile = await getPublicProfile(leaky as never, "ada");

    expect(profile).toEqual({ handle: "ada", displayName: "Ada", avatarUrl: null, bio: null, links: [], companionId: null, customCompanionName: null });
  });

  it("reflects a Companion change without any copy step, because both read one record", async () => {
    const backend = new FakeBackend();
    const owner = backend.addUser("owner");
    const client = backend.client(owner.id);
    await client.rpc("update_my_public_profile", { p_enabled: true, p_handle: "ada", p_display_name: null, p_bio: null, p_links: [] });

    await client.rpc("set_my_companion", { p_companion_id: null, p_custom_name: "Robo" });
    expect(await getPublicProfile(backend.client(null), "ada")).toMatchObject({ companionId: null, customCompanionName: "Robo" });

    await client.rpc("set_my_companion", { p_companion_id: "paw-default", p_custom_name: null });
    expect(await getPublicProfile(backend.client(null), "ada")).toMatchObject({ companionId: "paw-default", customCompanionName: null });
  });

  it("only looks up well-formed handles", async () => {
    const backend = new FakeBackend();
    expect(await getPublicProfile(backend.client(null), "../admin")).toBeNull();
    expect(await getPublicProfile(backend.client(null), "a")).toBeNull();
  });

  it("validates settings input before it reaches the database", () => {
    expect(parsePublicProfileInput({ enabled: true, handle: " Ada-1 ", displayName: " Ada ", bio: "", links: [{ label: "Site", url: "https://ada.dev" }] })).toEqual({
      enabled: true,
      handle: "ada-1",
      displayName: "Ada",
      bio: null,
      links: [{ label: "Site", url: "https://ada.dev" }],
    });
    expect(() => parsePublicProfileInput({ handle: "no" })).toThrow(ProfileError);
    expect(() => parsePublicProfileInput({ handle: "ada", links: [{ label: "x", url: "http://insecure.example" }] })).toThrow(ProfileError);
    expect(() => parsePublicProfileInput({ handle: "ada", links: [{ label: "x", url: "javascript:alert(1)" }] })).toThrow(ProfileError);
    expect(() => parsePublicProfileInput({ handle: "ada", bio: "x".repeat(281) })).toThrow(ProfileError);
  });
});
