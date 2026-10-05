import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../src/lib/account/testing/fakeBackend";
import { FakeGitHub } from "../src/lib/account/testing/fakeGitHub";
import { ANON_KEY, SERVICE_KEY, revokedUsers, sessionCookie, startMockSupabase, type MockModel } from "./mockSupabase";

/**
 * PawOS Web in a real browser: the real Next.js dev server, real Chromium (Playwright), a mock
 * Supabase. Desktop, tablet and phone viewports; touch; the on-screen keyboard; and the connection
 * failures phones actually have — a response lost after the server got the request, a reload while
 * the reply is being written, going offline mid-send.
 *
 * LOCAL ONLY. Set E2E_SCREENSHOTS=<dir> to keep screenshots of every layout.
 */

// Playwright is not a dependency of pawos-web; use the copy installed on the machine.
const requireFrom = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return requireFrom("playwright");
  } catch {
    return requireFrom(path.join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Playwright's types aren't installed here
type Any = any;

const APP_PORT = 3199;
const SUPABASE_PORT = 54399;
const APP = `http://localhost:${APP_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOTS ?? "";

const VIEWPORTS = {
  desktop: { width: 1280, height: 800, touch: false },
  tablet: { width: 820, height: 1180, touch: true },
  mobile: { width: 390, height: 844, touch: true },
  small: { width: 320, height: 640, touch: true },
} as const;
type ViewportName = keyof typeof VIEWPORTS;

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let backend: FakeBackend;
const model: MockModel = { calls: 0, delayMs: 0 };
let mock: http.Server;
let next: ChildProcess;
let browser: Any;
let users: Record<"pro" | "go" | "goFull" | "net" | "builder" | "deskBuilder", User>;
const GITHUB_TOKEN = "gho_e2e_builder_token";
const github = new FakeGitHub(GITHUB_TOKEN);
let codeChatId: string;
let desktopChatId: string;

function seedExchange(userId: string, chatId: string | null, question: string, answer: string, requiresDesktop = false): string {
  const result = backend.rpc(null, "web_chat_append_exchange", { p_user_id: userId, p_chat_id: chatId, p_user_content: question, p_assistant_content: answer, p_message_limit: null, p_request_id: null, p_requires_desktop: requiresDesktop }, true);
  return String((result.data as { chatId: string }).chatId);
}

async function waitForServer(url: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not come up`);
}

async function open(user: User | null, viewport: ViewportName, url: string): Promise<{ context: Any; page: Any }> {
  const size = VIEWPORTS[viewport];
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch && size.width < 500, deviceScaleFactor: 2 });
  if (user) {
    const cookie = sessionCookie(user);
    await context.addCookies([{ name: cookie.name, value: cookie.value, domain: "localhost", path: "/", httpOnly: false, sameSite: "Lax" }]);
  }
  // The site-wide cookie notice sits over the bottom of the screen until answered; answer it, as a
  // returning visitor would have.
  await context.addInitScript(() => window.localStorage.setItem("pawos-cookie-consent", "declined"));
  const page = await context.newPage();
  await page.goto(`${APP}${url}`, { waitUntil: "networkidle" });
  return { context, page };
}

async function horizontalOverflow(page: Any): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function shot(page: Any, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

const userMessages = (uid: string) => backend.tables.web_chat_messages.filter((m) => m.user_id === uid && m.role === "user");

beforeAll(async () => {
  backend = new FakeBackend();
  users = {
    pro: backend.addUser("e2e-pro", { subscription: { active: true, tier: "pro" }, meta: { full_name: "Pro Person" } }),
    go: backend.addUser("e2e-go", { meta: { full_name: "Go Person" } }),
    goFull: backend.addUser("e2e-go-full", { meta: { full_name: "Full Go" } }),
    net: backend.addUser("e2e-net", { subscription: { active: true, tier: "proMax" }, meta: { full_name: "Network Tester" } }),
    builder: backend.addUser("e2e-builder", { subscription: { active: true, tier: "pro" }, meta: { full_name: "Frontend Builder" } }),
    deskBuilder: backend.addUser("e2e-desk-builder", { subscription: { active: true, tier: "proMax" }, meta: { full_name: "Desk Builder" } }),
    revoked: backend.addUser("e2e-revoked", { subscription: { active: true, tier: "pro" }, meta: { full_name: "Signed Out Elsewhere" } }),
  };
  // Already connected, with a repository chosen earlier.
  backend.addConnection("e2e-desk-builder", "github", "connected", { username: "builder" });
  Object.assign(backend.tables.connectivity_credentials.at(-1) ?? {}, { secret: GITHUB_TOKEN, refresh_token: null, expires_at: null });
  backend.tables.web_repository_selection.push({ user_id: "e2e-desk-builder", provider: "github", full_name: "acme/storefront", default_branch: "main" });
  // A chat this account had in PawOS Desktop (synced to the account by the desktop app).
  backend.tables.web_chats.push({ id: "00000000-0000-4000-8000-0000000000de", user_id: "e2e-pro", title: "Refactor the API client", surface: "desktop", desktop_session_id: "desk-1", updated_at: "2026-10-03T09:00:00Z" });
  backend.tables.web_chat_messages.push(
    { id: "de-1", chat_id: "00000000-0000-4000-8000-0000000000de", user_id: "e2e-pro", role: "user", content: "Refactor the API client into hooks", request_id: "desktop-t1", surface: "desktop", created_at: "2026-10-03T08:00:00Z" },
    { id: "de-2", chat_id: "00000000-0000-4000-8000-0000000000de", user_id: "e2e-pro", role: "assistant", content: "Done — I moved the calls into useApi.ts and ran the tests.", request_id: "desktop-t1", surface: "desktop", created_at: "2026-10-03T08:00:01Z" }
  );
  // The builder has GitHub connected (as the desktop app or the web flow would have stored it).
  backend.addConnection("e2e-builder", "github", "connected", { username: "builder" });
  Object.assign(backend.tables.connectivity_credentials.at(-1) ?? {}, { secret: GITHUB_TOKEN, refresh_token: null, expires_at: null });
  github.addRepo("acme/storefront", { "src/components/Header.tsx": "export function Header() {\n  return <header>Shop</header>;\n}\n", "server/db.ts": "export const db = 1;\n" });
  codeChatId = seedExchange("e2e-pro", null, "Show me some code with a very long line", `Here is a long line of code:\n\n\`\`\`ts\nconst result = [${Array.from({ length: 40 }, (_, i) => `"value-${i}"`).join(", ")}].map((item) => item.toUpperCase());\n\`\`\`\n\n${"This explanation is long and has to wrap on a phone. ".repeat(50)}${"Averyveryverylongwordwithoutanyspaces".repeat(6)}`);
  desktopChatId = seedExchange("e2e-pro", null, "Run my tests please", "Running your tests needs PawOS Desktop — PawOS Web can't run commands.", true);
  for (let i = 0; i < 4; i++) backend.rpc(null, "web_chat_append_exchange", { p_user_id: "e2e-go-full", p_chat_id: null, p_user_content: `Question ${i + 1}`, p_assistant_content: `Answer ${i + 1}`, p_message_limit: 4, p_request_id: `seed-go-${i}` }, true);
  backend.usageSummary = { plan: { label: "Paw Pro" }, buckets: [{ id: "b1", label: "Monthly plan", type: "monthly_plan", pcTotal: 1000, pcUsed: 420, percentUsed: 42, status: "active", resetsAt: "2026-11-01T00:00:00Z" }], weeklyPacing: null, limitReached: false, limitResetsAt: null };
  backend.usageHistory.set("e2e-pro", [
    { at: "2026-10-04T10:00:00Z", category: "web-chat", bucketType: "monthly_plan", pc: 1 },
    { at: "2026-10-04T09:00:00Z", category: "autonomous-work", bucketType: "monthly_plan", pc: 12 },
  ]);

  mock = await startMockSupabase(backend, model, SUPABASE_PORT, github);
  next = spawn("npx", ["next", "dev", "--port", String(APP_PORT)], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${SUPABASE_PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      GEMINI_API_KEY: "e2e-model-key",
      WEB_CHAT_MODEL_BASE_URL: `http://localhost:${SUPABASE_PORT}/v1beta`,
      WEB_GITHUB_API_BASE_URL: `http://localhost:${SUPABASE_PORT}/github-api`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore",
    detached: true,
  });
  await waitForServer(`${APP}/login`, 240_000);
  browser = await loadPlaywright().chromium.launch();
  // Compile the main routes once so the first test isn't timing the compiler.
  const { context } = await open(users.pro, "desktop", "/app");
  await context.close();
});

afterAll(async () => {
  await browser?.close();
  if (next?.pid) {
    try {
      process.kill(-next.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await new Promise((resolve) => mock?.close(resolve));
});

describe("sign-in", () => {
  it("a signed-out visit to /app goes to the login page, and the chat API answers 401", async () => {
    const { context, page } = await open(null, "mobile", "/app");
    expect(new URL(page.url()).pathname).toBe("/login");
    const response = await page.request.post(`${APP}/api/web-chat/messages`, { data: { content: "hi" }, headers: { origin: APP } });
    expect(response.status()).toBe(401);
    await context.close();
  });

  it("a signed-in visit opens the workspace", async () => {
    const { context, page } = await open(users.pro, "desktop", "/app");
    expect(new URL(page.url()).pathname).toBe("/app");
    await expect(page.getByLabel("Message Paw").isVisible()).resolves.toBe(true);
    await context.close();
  });
});

describe("log in and sign up", () => {
  it.each(Object.keys(VIEWPORTS) as ViewportName[])("log in at %s size: Google and GitHub, then the email, then the password", async (viewport) => {
    const { context, page } = await open(null, viewport, "/login");
    await expect(page.getByTestId("oauth-google").isVisible()).resolves.toBe(true);
    await expect(page.getByTestId("oauth-github").isVisible()).resolves.toBe(true);
    await expect(page.getByText("Microsoft").count()).resolves.toBe(0);
    await expect(page.getByLabel("Password").count()).resolves.toBe(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shot(page, `login-${viewport}`);

    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.getByLabel("Password").waitFor();
    await expect(page.getByTestId("chosen-email").textContent()).resolves.toBe("someone@example.com");
    await shot(page, `login-password-${viewport}`);
    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByLabel("Email").inputValue()).resolves.toBe("someone@example.com");
    await context.close();
  });

  it.each(Object.keys(VIEWPORTS) as ViewportName[])("sign up at %s size: names and email, then the emailed code (before any password)", async (viewport) => {
    const { context, page } = await open(null, viewport, "/signup");
    await expect(page.getByText("Microsoft").count()).resolves.toBe(0);
    await expect(page.getByLabel("Password").count()).resolves.toBe(0);
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Lovelace");
    await page.getByLabel("Email").fill("ada@example.com");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shot(page, `signup-${viewport}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByTestId("code-input").waitFor();
    await expect(page.getByLabel("Password").count()).resolves.toBe(0);
    await expect(page.getByRole("button", { name: "Verify" }).isDisabled()).resolves.toBe(true);
    await shot(page, `signup-code-${viewport}`);
    await context.close();
  });

  it("forgot password: the email, then the emailed code (before the new password)", async () => {
    const { context, page } = await open(null, "mobile", "/forgot-password?email=ada%40example.com");
    await expect(page.getByLabel("Email").inputValue()).resolves.toBe("ada@example.com");
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByTestId("code-input").waitFor();
    await expect(page.getByLabel("New password").count()).resolves.toBe(0);
    await shot(page, "forgot-password-code-mobile");
    await context.close();
  });
});

describe("one account across PawOS Desktop and PawOS Web", () => {
  it("signing out in PawOS Desktop sends an open PawOS Web page to the login page", async () => {
    const { context, page } = await open(users.revoked, "desktop", "/app");
    expect(new URL(page.url()).pathname).toBe("/app");
    revokedUsers.add(users.revoked.id);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForURL((url: URL) => url.pathname === "/login", { timeout: 15_000 });
    await context.close();
  });
});

describe.each(Object.keys(VIEWPORTS) as ViewportName[])("layout at %s size", (viewport) => {
  const size = VIEWPORTS[viewport];
  const narrow = size.width < 768;

  it("a long conversation with code fits the screen: no sideways page scroll, code scrolls inside its block", async () => {
    const { context, page } = await open(users.pro, viewport, `/app?chat=${codeChatId}`);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    const pre = page.locator("pre").first();
    const { scrollWidth, clientWidth, overflowX } = await pre.evaluate((el: HTMLElement) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
    expect(overflowX).toBe("auto");
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    // The composer is on screen and usable.
    const box = await page.getByLabel("Message Paw").boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    await shot(page, `app-${viewport}`);
    await context.close();
  });

  it(narrow ? "uses a drawer for chats and navigation" : "shows the sidebar", async () => {
    const { context, page } = await open(users.pro, viewport, "/app");
    const menu = page.getByRole("button", { name: "Open menu" });
    if (!narrow) {
      expect(await menu.isVisible()).toBe(false);
      expect(await page.getByRole("link", { name: "Run my tests please" }).first().isVisible()).toBe(true);
      await context.close();
      return;
    }
    expect(await menu.isVisible()).toBe(true);
    await menu.tap();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await drawer.waitFor();
    await shot(page, `app-drawer-${viewport}`);
    // The account menu works by touch inside the drawer.
    await drawer.getByRole("button", { name: "Account menu" }).tap();
    expect(await drawer.getByRole("menuitem", { name: "Dashboard" }).isVisible()).toBe(true);
    await drawer.getByRole("button", { name: "Account menu" }).tap();
    // Picking a chat navigates and closes the drawer.
    await drawer.getByRole("link", { name: "Run my tests please" }).tap();
    await page.waitForURL(new RegExp(`chat=${desktopChatId}`));
    await drawer.waitFor({ state: "detached" });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await context.close();
  });

  it("dashboard pages need no sideways scrolling", async () => {
    for (const route of ["/dashboard", "/dashboard/settings", "/dashboard/integrations", "/dashboard/spending", "/dashboard/companion"]) {
      const { context, page } = await open(users.pro, viewport, route);
      expect(new URL(page.url()).pathname).toBe(route);
      expect(await horizontalOverflow(page), `${route} at ${viewport}`).toBeLessThanOrEqual(1);
      if (route === "/dashboard" || route === "/dashboard/integrations") await shot(page, `${route.replace(/\//g, "_")}-${viewport}`);
      if (narrow && route === "/dashboard") {
        await page.getByRole("button", { name: "Open menu" }).tap();
        const drawer = page.getByRole("dialog", { name: "Dashboard menu" });
        await drawer.getByRole("link", { name: "Integrations" }).tap();
        await page.waitForURL(/\/dashboard\/integrations$/);
      }
      await context.close();
    }
  });
});

describe("touch", () => {
  it("core controls are finger-sized on a phone", async () => {
    const { context, page } = await open(users.go, "mobile", "/app");
    for (const name of ["Open menu", "New chat", "Send message"]) {
      const box = await page.getByRole(name === "New chat" ? "link" : "button", { name }).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(40);
      expect(box?.width, name).toBeGreaterThanOrEqual(40);
    }
    // Paw Go: messages only — no attach control at all.
    expect(await page.locator('button[aria-label^="Attach a photo or file"]').count()).toBe(0);
    // Paw Go: the upgrade button is reachable from the drawer.
    await page.getByRole("button", { name: "Open menu" }).tap();
    expect(await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Upgrade plan" }).isVisible()).toBe(true);
    await context.close();
  });

  it("the composer stays above the on-screen keyboard", async () => {
    const { context, page } = await open(users.pro, "mobile", `/app?chat=${codeChatId}`);
    const attach = await page.locator('button[aria-label^="Attach a photo or file"]').boundingBox();
    expect(attach?.height).toBeGreaterThanOrEqual(40);
    const field = page.getByLabel("Message Paw");
    await field.tap();
    // The keyboard takes the bottom of the screen; the page is resized to what remains.
    await page.setViewportSize({ width: 390, height: 460 });
    await page.waitForTimeout(300);
    const box = await field.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(460);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await shot(page, "app-keyboard-mobile");
    await context.close();
  });
});

describe("unreliable connections (phone)", () => {
  async function sendText(page: Any, text: string) {
    await page.getByLabel("Message Paw").fill(text);
    await page.getByRole("button", { name: "Send message" }).tap();
  }

  it("a response lost after the server got the request is recovered — one message, one model call", async () => {
    const { context, page } = await open(users.net, "mobile", "/app");
    const callsBefore = model.calls;
    let dropped = false;
    await page.route("**/api/web-chat/messages", async (route: Any) => {
      if (dropped) return route.continue();
      dropped = true;
      await route.fetch(); // the server receives and answers…
      await route.abort("internetdisconnected"); // …but the phone never sees the answer
    });
    await sendText(page, "Lost reply question");
    await page.getByText("Reply to: Lost reply question").waitFor({ timeout: 30_000 });
    // Visible on screen once (the chat list also names the new chat after it, in a sidebar hidden on a phone).
    expect(await page.getByText("Lost reply question", { exact: true }).filter({ visible: true }).count()).toBe(1);
    expect(userMessages("e2e-net").filter((m) => m.content === "Lost reply question")).toHaveLength(1);
    expect(model.calls - callsBefore).toBe(1);
    await context.close();
  });

  it("reloading while the reply is being written recovers it from the server", async () => {
    const { context, page } = await open(users.net, "mobile", "/app");
    const callsBefore = model.calls;
    await sendText(page, "slow question for reload");
    await page.waitForTimeout(800); // the server has it and is waiting on the model
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Reply to: slow question for reload").waitFor({ timeout: 30_000 });
    // The restored pending message is replaced by the stored one — shown exactly once.
    // Visible on screen once (the chat list also names the new chat after it, in a sidebar hidden on a phone).
    expect(await page.getByText("slow question for reload", { exact: true }).filter({ visible: true }).count()).toBe(1);
    expect(userMessages("e2e-net").filter((m) => m.content === "slow question for reload")).toHaveLength(1);
    expect(model.calls - callsBefore).toBe(1);
    await context.close();
  });

  it("going offline mid-send shows it, keeps the message, and sends it once back online", async () => {
    const { context, page } = await open(users.net, "mobile", "/app");
    await context.setOffline(true);
    await sendText(page, "Offline question");
    await page.getByTestId("connection-state").getByText("Offline").waitFor();
    await page.getByText("You're offline. Your message will be sent when you're back.").waitFor();
    await shot(page, "app-offline-mobile");
    await context.setOffline(false);
    await page.getByText("Reply to: Offline question").waitFor({ timeout: 30_000 });
    expect(userMessages("e2e-net").filter((m) => m.content === "Offline question")).toHaveLength(1);
    await context.close();
  });
});

describe("features on a phone", () => {
  it("attaches a photo from the photo picker, sends it, and shows it in the thread", async () => {
    const { context, page } = await open(users.net, "mobile", "/app");
    await page.locator('input[type="file"]').setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: PNG_1PX });
    await page.getByTestId("photo-attachment").getByText("Ready").waitFor();
    await page.getByLabel("Message Paw").fill("What is in this photo?");
    await page.getByRole("button", { name: "Send message" }).tap();
    await page.getByText("Reply to: What is in this photo?").waitFor({ timeout: 30_000 });
    await page.waitForURL(/\/app\?chat=/);
    await page.reload({ waitUntil: "networkidle" });
    const image = page.locator('img[alt="camera.png"]');
    await image.waitFor();
    expect(await image.getAttribute("src")).toMatch(/^\/api\/web-chat\/uploads\//);
    expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    await context.close();
  });

  it("offers Continue in PawOS Desktop for a Desktop-only request, without a desktop link on a phone", async () => {
    const { context, page } = await open(users.pro, "mobile", `/app?chat=${desktopChatId}`);
    await page.getByRole("button", { name: "Continue in PawOS Desktop" }).last().tap();
    const sheet = page.getByRole("dialog", { name: "Continue in PawOS Desktop" });
    await sheet.getByLabel("Conversation to paste into PawOS Desktop").waitFor();
    expect(await sheet.getByLabel("Conversation to paste into PawOS Desktop").inputValue()).toContain("Run my tests please");
    expect(await sheet.getByRole("link", { name: "Open PawOS Desktop" }).count()).toBe(0);
    await shot(page, "app-handoff-mobile");
    await context.close();
  });

  it("offers the desktop link on a computer", async () => {
    const { context, page } = await open(users.pro, "desktop", `/app?chat=${desktopChatId}`);
    await page.getByRole("button", { name: "Continue in PawOS Desktop" }).first().click();
    const link = page.getByRole("dialog", { name: "Continue in PawOS Desktop" }).getByRole("link", { name: "Open PawOS Desktop" });
    await link.waitFor();
    expect(await link.getAttribute("href")).toBe("pawos://jump/new-chat");
    await context.close();
  });

  it("Paw Go at its limit sees 4 / 4 used and cannot send", async () => {
    const { context, page } = await open(users.goFull, "mobile", "/app");
    await page.getByText("4 / 4 web messages used.").waitFor();
    expect(await page.getByLabel("Message Paw").isDisabled()).toBe(true);
    const direct = await page.request.post(`${APP}/api/web-chat/messages`, { data: { content: "fifth", tier: "enterprise" }, headers: { origin: APP } });
    expect(direct.status()).toBe(402);
    expect(userMessages("e2e-go-full")).toHaveLength(4);
    await shot(page, "app-go-limit-mobile");
    await context.close();
  });
});

describe("code changes from a phone", () => {
  it("Paw Go: Small change mode, and prompts are limited to two lines — shown while typing", async () => {
    const { context, page } = await open(users.go, "mobile", "/app");
    await page.getByRole("radio", { name: "Code" }).tap();
    await page.getByTestId("change-status").getByRole("link", { name: "Connect GitHub" }).waitFor();
    await page.getByRole("radio", { name: "Chat" }).tap();
    await page.getByLabel("Message Paw").fill("Change the heading\nand the footer\nand the button");
    await page.getByTestId("prompt-limit").waitFor();
    expect(await page.getByRole("button", { name: "Send message" }).isDisabled()).toBe(true);
    await shot(page, "app-go-prompt-limit-mobile");
    await page.getByLabel("Message Paw").fill("Change the heading to Welcome");
    expect(await page.getByTestId("prompt-limit").count()).toBe(0);
    await context.close();
  });

  it("a paid plan without GitHub is asked to connect it first, and can't send a change", async () => {
    const { context, page } = await open(users.pro, "mobile", "/app");
    // Chat is the default mode and needs nothing set up — no GitHub steps until Code is chosen.
    expect(await page.getByRole("radio", { name: "Chat" }).getAttribute("aria-checked")).toBe("true");
    expect(await page.getByTestId("change-status").count()).toBe(0);
    await shot(page, "app-chat-default-mobile");
    await page.getByRole("radio", { name: "Code" }).tap();
    await page.getByTestId("change-status").getByRole("link", { name: "Connect GitHub" }).waitFor();
    // The steps before coding: connect GitHub (the current step), select a repository, start coding.
    expect(await page.getByTestId("change-status").getByText("Select a repository", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByTestId("change-status").getByText("Start coding", { exact: true }).isVisible()).toBe(true);
    await shot(page, "app-change-setup-mobile");
    await page.getByLabel("Message Paw").fill("Make the header sticky");
    expect(await page.getByRole("button", { name: "Send message" }).isDisabled()).toBe(true);
    await context.close();
  });

  it("with GitHub connected: the change is pushed to main, the plan shows each step, and the preview opens in a new tab", async () => {
    // The repository's host publishes a preview deployment for every pushed commit.
    github.onPush = (_repo, _branch, sha) =>
      github.signals.set(sha, { deployments: [{ environment: "Preview", state: "success", url: "https://preview.pawos-e2e.test/" }], checks: [{ id: 1, name: "build", status: "completed", conclusion: "success" }] });
    const { context, page } = await open(users.builder, "mobile", "/app");
    await context.route("https://preview.pawos-e2e.test/**", (route: Any) => route.fulfill({ contentType: "text/html", body: "<h1>Storefront preview</h1>" }));
    await page.getByRole("radio", { name: "Code" }).tap();
    await page.getByTestId("change-status").getByRole("button", { name: "Choose repository" }).tap();
    await page.getByRole("dialog", { name: "Choose a repository" }).getByRole("button", { name: /acme\/storefront/ }).tap();
    await page.getByTestId("change-status").getByText("acme/storefront", { exact: true }).waitFor();
    // The repository and the branch changes go to stay visible above the message box.
    expect(await page.getByTestId("current-branch").textContent()).toBe("main");
    await shot(page, "app-change-ready-mobile");

    await page.getByLabel("Message Paw").fill("Make the header sticky on mobile");
    const previewTab = context.waitForEvent("page");
    await page.getByRole("button", { name: "Send message" }).tap();
    const tab = await previewTab;

    // The chat: the plan, then the reply.
    const panel = page.getByTestId("task-panel").first();
    await panel.waitFor();
    await page.getByText(/Done — I pushed the change to `main`/).waitFor({ timeout: 60_000 });
    await panel.getByText(/^Done/).waitFor({ timeout: 30_000 });
    expect(await panel.getByText("Commit and push to main").count()).toBe(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // A chat that holds a code change stays in Code mode after it finishes (and when reopened).
    expect(await page.getByRole("radio", { name: "Code" }).getAttribute("aria-checked")).toBe("true");
    await shot(page, "app-change-done-mobile");

    // The new tab lands on the repository's preview.
    await tab.waitForURL("https://preview.pawos-e2e.test/", { timeout: 60_000 });
    expect(await tab.getByText("Storefront preview").count()).toBe(1);

    expect(github.filesOn("acme/storefront", "main")?.["src/components/Header.tsx"]).toContain("sticky");
    expect(await page.content()).not.toContain(GITHUB_TOKEN);
    await context.close();
  });

  it("on a computer the plan sits on the right", async () => {
    const { context, page } = await open(users.deskBuilder, "desktop", "/app");
    await page.getByRole("radio", { name: "Code" }).click();
    await page.getByTestId("change-status").getByText("acme/storefront", { exact: true }).waitFor();
    await page.getByLabel("Message Paw").fill("Make the header bold");
    await page.getByRole("button", { name: "Send message" }).click();
    const aside = page.getByRole("complementary", { name: "Plan for the current change" });
    await aside.waitFor();
    await aside.getByText(/^Done|^Pushed/).waitFor({ timeout: 60_000 });
    const box = await aside.boundingBox();
    expect(box.x + box.width).toBeGreaterThanOrEqual(1279);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shot(page, "app-change-desktop");
    await context.close();
  });
});

describe("one chat history across Desktop, Web and mobile", () => {
  it("a chat from PawOS Desktop shows on a phone, labelled, with what Web and mobile can and can't do", async () => {
    const { context, page } = await open(users.pro, "mobile", "/app");
    await page.getByRole("button", { name: "Open menu" }).tap();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    const link = drawer.getByRole("link", { name: /Refactor the API client/ });
    expect(await link.getByText("Desktop", { exact: true }).count()).toBe(1);
    await link.tap();
    await page.getByTestId("shared-chat-note").waitFor();
    expect(await page.getByText("Paw · on PawOS Desktop").count()).toBe(1);
    expect(await page.getByText("Done — I moved the calls into useApi.ts and ran the tests.").count()).toBe(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shot(page, "app-shared-desktop-chat-mobile");
    await context.close();
  });
});
