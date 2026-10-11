import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PawOS Web's own address, and who gets to say what it is.
 *
 * Two things are held here. First, the site names the right domain: https://pawos.revantaai.com —
 * pawos.app is not PawOS's and appears nowhere. Second, no absolute link the server builds comes
 * from the request's Host or X-Forwarded-Host header: in production those are whatever the caller
 * sent, and the reverse proxy passes them through. The routes are exercised as production runs
 * them (NODE_ENV=production), with forged headers, through their real handlers.
 */
const state = vi.hoisted(() => ({ oauthOptions: [] as { redirectTo?: string }[], signedIn: false }));

vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOAuth: async (request: { options: { redirectTo?: string } }) => {
        state.oauthOptions.push(request.options);
        return { data: { url: `https://project.supabase.test/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(request.options.redirectTo ?? "")}` }, error: null };
      },
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: state.signedIn ? { id: "user-1" } : null } }),
    },
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { GET as githubStart } from "../app/auth/github/start/route";
import { GET as authCallback } from "../app/auth/callback/route";
import { POST as deviceAuthorize } from "../app/api/auth/device/authorize/route";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { rejectCrossOrigin } from "./account/api";
import { handleConnectorCallback } from "./account/webOAuthCallback";
import { OFFICIAL_SITE_ORIGIN, isSameSiteOrigin, siteOrigin, trustedOrigin } from "./siteOrigin";

const OFFICIAL = "https://pawos.revantaai.com";
const EVIL = "evil.example";
/** The ways a caller can lie about where the site is. */
const FORGERIES: Record<string, Record<string, string>> = {
  "a forged X-Forwarded-Host": { host: "pawos.revantaai.com", "x-forwarded-host": EVIL },
  "a forged Host": { host: EVIL },
  "both forged": { host: EVIL, "x-forwarded-host": EVIL, "x-forwarded-proto": "http" },
  "a forged X-Forwarded-Host with a port": { host: "pawos.revantaai.com", "x-forwarded-host": `${EVIL}:8443` },
  "a list of forwarded hosts": { host: "pawos.revantaai.com", "x-forwarded-host": `${EVIL}, pawos.revantaai.com` },
  "a local name forged in production": { host: "localhost:3000" },
  "a lookalike of the real name": { host: "pawos.revantaai.com.evil.example", "x-forwarded-host": "pawos.revantaai.com.evil.example" },
};
const get = (url: string, headers: Record<string, string>) => new Request(url, { headers });
const location = (response: Response) => response.headers.get("location") ?? "";

beforeEach(() => {
  state.oauthOptions = [];
  state.signedIn = false;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("domain correctness", () => {
  it("the official address is pawos.revantaai.com, over https", () => {
    expect(OFFICIAL_SITE_ORIGIN).toBe(OFFICIAL);
    expect(siteOrigin()).toBe(OFFICIAL);
  });

  it("every address in the sitemap, and the sitemap robots.txt names, is on the official domain", () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(50);
    for (const entry of entries) expect(entry.url.startsWith(`${OFFICIAL}/`) || entry.url === OFFICIAL, entry.url).toBe(true);
    expect(robots().sitemap).toBe(`${OFFICIAL}/sitemap.xml`);
  });

  it("the page metadata's canonical base is the official domain", () => {
    const layout = fs.readFileSync(path.join(__dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("const SITE_URL = OFFICIAL_SITE_ORIGIN;");
    expect(layout).toContain("metadataBase: new URL(SITE_URL)");
  });

  it("pawos.app appears nowhere in PawOS: not the website, the desktop app, the CLI, the extension or the shared code", () => {
    const repo = path.join(__dirname, "..", "..", "..");
    const roots = ["pawos-web/src", "src", "pawos-cli/src", "pawos-shared/src", "pawos-vscode/src", "supabase/migrations"];
    const offenders: string[] = [];
    for (const root of roots) {
      const base = path.join(repo, root);
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(ts|tsx|js|mjs|cjs|json|sql|html|css|md)$/.test(entry.name)) continue;
        const file = path.join(entry.parentPath, entry.name);
        // The two tests that name the wrong domain in order to forbid it.
        if (file.includes(`${path.sep}node_modules${path.sep}`) || /(siteOrigin|officialDomain)\.test\.ts$/.test(file)) continue;
        if (/pawos\.app\b/.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(repo, file));
      }
    }
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(path.join(repo, ".env.example"), "utf8")).not.toMatch(/pawos\.app\b/);
  });

  it("a configured address is used only if it is a plain https origin", () => {
    for (const [configured, expected] of [
      ["https://staging.pawos.example", "https://staging.pawos.example"],
      ["https://staging.pawos.example/some/path?x=1", "https://staging.pawos.example"],
      ["http://staging.pawos.example", OFFICIAL],
      ["https://user:pass@staging.pawos.example", OFFICIAL],
      ["javascript:alert(1)", OFFICIAL],
      ["//evil.example", OFFICIAL],
      ["not an address", OFFICIAL],
      ["", OFFICIAL],
    ]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", configured!);
      expect(siteOrigin(), configured).toBe(expected);
    }
  });
});

describe("forged host headers do not move the site", () => {
  it.each(Object.entries(FORGERIES))("%s: the trusted origin is still the official one", (_label, headers) => {
    expect(trustedOrigin(get(`http://localhost:3000/anything`, headers))).toBe(OFFICIAL);
    expect(trustedOrigin(get(`https://${EVIL}/anything`, headers))).toBe(OFFICIAL);
  });

  it.each(Object.entries(FORGERIES))("GitHub sign-in start, %s: Supabase is told to come back to the official site", async (_label, headers) => {
    const response = await githubStart(get("http://localhost:3000/auth/github/start", headers));
    expect(response.status).toBe(307);
    expect(state.oauthOptions).toEqual([{ redirectTo: `${OFFICIAL}/auth/callback`, skipBrowserRedirect: true }]);
    expect(new URL(location(response)).searchParams.get("redirect_to")).toBe(`${OFFICIAL}/auth/callback`);
    expect(location(response)).not.toContain(EVIL);
  });

  it.each(Object.entries(FORGERIES))("sign-in callback, %s: every redirect it makes stays on the official site", async (_label, headers) => {
    const cases = ["/auth/callback?code=abc", "/auth/callback?code=abc&next=/dashboard/billing", "/auth/callback", "/auth/callback?error=access_denied", `/auth/callback?code=abc&next=https://${EVIL}/x`, `/auth/callback?code=abc&next=//${EVIL}/x`];
    for (const target of cases) {
      const response = await authCallback(get(`http://localhost:3000${target}`, headers));
      expect(response.status, target).toBe(307);
      expect(new URL(location(response)).origin, target).toBe(OFFICIAL);
    }
  });

  it.each(Object.entries(FORGERIES))("connector callback, %s: the browser is sent back to the official site", async (_label, headers) => {
    const response = await handleConnectorCallback(get("http://localhost:3000/api/connectivity/oauth/callback/github?code=abc&state=web.abc123", headers), "github");
    expect(response.status).toBe(307);
    expect(new URL(location(response)).origin).toBe(OFFICIAL);
    expect(location(response)).toBe(`${OFFICIAL}/dashboard/integrations?integration=github&status=expired`);
  });

  it("a request can't pass the same-site check by naming its own host", async () => {
    // A page on evil.example makes the browser send this; the request's Host says evil.example too.
    for (const headers of [{ host: EVIL, origin: `https://${EVIL}` }, { host: "pawos.revantaai.com", "x-forwarded-host": EVIL, origin: `https://${EVIL}` }, { host: EVIL, "x-forwarded-host": EVIL, origin: `https://${EVIL}` }]) {
      const request = new Request("http://localhost:3000/api/dashboard/profile", { method: "POST", headers });
      expect(rejectCrossOrigin(request)?.status).toBe(403);
      state.signedIn = true;
      const authorize = await deviceAuthorize(new Request("http://localhost:3000/api/auth/device/authorize", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" }));
      expect(authorize.status).toBe(403);
    }
  });

  it("the site's own pages still pass it, and so does a client that sends no Origin", () => {
    const own = new Request("http://localhost:3000/api/dashboard/profile", { method: "POST", headers: { host: "pawos.revantaai.com", origin: OFFICIAL } });
    expect(rejectCrossOrigin(own)).toBeNull();
    expect(rejectCrossOrigin(new Request("http://localhost:3000/api/web/agent/turn", { method: "POST", headers: { host: "pawos.revantaai.com" } }))).toBeNull();
    for (const origin of [`${OFFICIAL}.evil.example`, "http://pawos.revantaai.com", "https://pawos.revantaai.com:8443", "https://www.pawos.revantaai.com", "null", "", "not an origin"]) {
      expect(isSameSiteOrigin(own, origin), origin).toBe(false);
    }
  });
});

describe("outside production, a local name works — and only a local name", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

  it("localhost gets itself back, so sign-in works in development", async () => {
    expect(trustedOrigin(get("http://localhost:3000/x", { host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(trustedOrigin(get("http://127.0.0.1:3000/x", { host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    await githubStart(get("http://localhost:3000/auth/github/start", { host: "localhost:3000" }));
    expect(state.oauthOptions[0]!.redirectTo).toBe("http://localhost:3000/auth/callback");
  });

  it("a forged name is not local, even in development", () => {
    for (const headers of [{ host: EVIL }, { host: "localhost:3000", "x-forwarded-host": EVIL }, { host: "localhost.evil.example" }, { host: "evil.example:3000" }]) {
      expect(trustedOrigin(get("http://localhost:3000/x", headers))).not.toContain(EVIL);
    }
    expect(trustedOrigin(get("http://localhost:3000/x", { host: "localhost:3000", "x-forwarded-host": EVIL }))).toBe("http://localhost:3000");
  });
});

describe("no server code reads the site's address from the request", () => {
  it("the configured address is read in one place only, so every absolute link agrees", () => {
    const base = path.join(__dirname, "..");
    const readers: string[] = [];
    for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (/process\.env\.NEXT_PUBLIC_SITE_URL/.test(fs.readFileSync(file, "utf8"))) readers.push(path.relative(base, file).split(path.sep).join("/"));
    }
    expect(readers).toEqual(["lib/siteOrigin.ts"]);
    // The password-reset link is built from it too.
    expect(fs.readFileSync(path.join(base, "app", "api", "auth", "password", "forgot", "route.ts"), "utf8")).toContain("const RESET_PAGE = `${siteOrigin()}/reset-password`;");
  });

  it("X-Forwarded-Host and X-Forwarded-Proto are read nowhere", () => {
    const base = path.join(__dirname, "..");
    const offenders: string[] = [];
    for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (/headers\.get\(\s*["']x-forwarded-(host|proto)["']\s*\)/i.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(base, file));
    }
    expect(offenders).toEqual([]);
  });
});
