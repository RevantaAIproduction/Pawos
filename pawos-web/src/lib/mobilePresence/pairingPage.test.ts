import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The phone's half of pairing: /pair/<session>?token=…, the page a phone lands on from the QR code
 * PawOS Desktop shows. This is where the phone authorizes — there is no other page for it.
 * (Desktop once built a second link, to /auth/mobile-pairing, which never existed here; that link
 * has been removed from Desktop rather than answered with a page that only looks like one.)
 *
 * Held here: the page does nothing for a signed-out visitor but send them to sign in and back;
 * it never pairs without the token; and pairing happens only when the signed-in person confirms.
 */
const state = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("../supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }));

import PairPage from "../../app/pair/[sessionId]/page";
import { PairClient } from "../../app/pair/[sessionId]/PairClient";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const TOKEN = "a".repeat(48);
const open = (token?: string) => PairPage({ params: Promise.resolve({ sessionId: SESSION }), searchParams: Promise.resolve(token === undefined ? {} : { token }) });
const app = path.join(__dirname, "..", "..", "app");

beforeEach(() => {
  state.user = null;
});

describe("the pairing page is where the phone authorizes", () => {
  it("a signed-out visitor is sent to sign in, and brought back to the same pairing link", async () => {
    const outcome = await open(TOKEN).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Redirected);
    const to = (outcome as Redirected).to;
    expect(to).toBe(`/login?next=/pair/${SESSION}?token=${TOKEN}`);
    // A path on this site: the pairing token never leaves it on the way through sign-in.
    expect(to.startsWith("/")).toBe(true);
    expect(to.startsWith("//")).toBe(false);
  });

  it("signed out, nothing about pairing is shown or done", async () => {
    await expect(open(TOKEN)).rejects.toBeInstanceOf(Redirected);
    await expect(open()).rejects.toBeInstanceOf(Redirected);
  });

  it("signed in without the token: it says the link is incomplete, and offers nothing to confirm", async () => {
    state.user = { id: "user-1", email: "alice@example.com" };
    const page = (await open()) as { type: unknown; props: unknown };
    expect(page.type).not.toBe(PairClient);
    const text = JSON.stringify(page.props);
    expect(text).toContain("Pairing link is missing its code");
    expect(text).not.toMatch(/Device paired|Confirm pairing/);
  });

  it("signed in with the token: the confirmation screen, for this account, holding the token it was given", async () => {
    state.user = { id: "user-1", email: "alice@example.com" };
    const page = (await open(TOKEN)) as { type: unknown; props: { token: string; userEmail: string | null } };
    expect(page.type).toBe(PairClient);
    expect(page.props).toEqual({ token: TOKEN, userEmail: "alice@example.com" });
  });

  it("pairing happens only when the person confirms, and success is only what the server said", () => {
    const client = fs.readFileSync(path.join(app, "pair", "[sessionId]", "PairClient.tsx"), "utf8");
    // The one call that pairs is made from the button's handler — never on load.
    expect(client.match(/rpc\("complete_pairing_session"/g)).toHaveLength(1);
    expect(client).not.toMatch(/useEffect/);
    expect(client).toContain("onClick={completePairing}");
    // "Device paired" is shown only in the success state, which is set only after the call returned without an error.
    const call = client.slice(client.indexOf("const completePairing"), client.indexOf("return ("));
    expect(call.indexOf("if (rpcError) throw rpcError;")).toBeGreaterThan(-1);
    expect(call.indexOf('setStatus("success")')).toBeGreaterThan(call.indexOf("if (rpcError) throw rpcError;"));
    expect(client.match(/setStatus\("success"\)/g)).toHaveLength(1);
    // The token is used for that call and nothing else: not stored, not put in an address, not logged.
    expect(client).not.toMatch(/localStorage\.setItem\([^)]*token|console\.(log|info|debug)|href=.*token|fetch\(/);
  });
});

describe("there is no /auth/mobile-pairing page, and nothing pretends there is", () => {
  it("the website has no such route", () => {
    expect(fs.existsSync(path.join(app, "auth", "mobile-pairing"))).toBe(false);
  });

  it("nothing on the website links to it", () => {
    const offenders: string[] = [];
    const src = path.join(app, "..");
    for (const entry of fs.readdirSync(src, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (/auth\/mobile-pairing/.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(src, file));
    }
    expect(offenders).toEqual([]);
  });
});
