import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/billing/checkout-seat while additional-seat purchases are paused.
 *
 * A seat order is a one-time payment for something that does not end (the seat stays, and its
 * member's allowance renews every month), so until seats are billed on a recurring basis PawOS
 * creates no new seat orders — for anyone, whatever the request says. Orders paid before the pause
 * are still honoured (see lib/billing/seatPurchase.test.ts), and nothing about existing seats changes.
 */
const ORG = "99999999-9999-4999-8999-999999999999";
const OWNER = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ user: null as { id: string } | null, tableReads: [] as string[], rpcCalls: [] as string[] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => (state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: "invalid" } }) },
    from: (table: string) => {
      state.tableReads.push(table);
      const row = table === "organizations" ? { id: "99999999-9999-4999-8999-999999999999", tier: "team", owner_user_id: "33333333-3333-4333-8333-333333333333" } : { role: "owner" };
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
      return chain;
    },
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      return { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/billing/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/razorpay")>()),
  getRazorpayCredentials: () => ({ keyId: "rzp_key", keySecret: "rzp_secret" }),
}));

import { POST } from "./route";
import { ADDITIONAL_SEAT_PURCHASES_PAUSED, SEAT_PURCHASES_PAUSED_CODE, SEAT_PURCHASES_PAUSED_REASON } from "@/lib/billing/seatPurchase";

const post = (body: unknown) => POST(new Request("https://pawos.test/api/billing/checkout-seat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

let outbound: string[];
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  state.user = { id: OWNER };
  state.tableReads = [];
  state.rpcCalls = [];
  outbound = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      outbound.push(String(input));
      return new Response(JSON.stringify({ id: "order_should_never_exist" }), { status: 200 });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("additional seats are paused", () => {
  it("the pause is on", () => {
    expect(ADDITIONAL_SEAT_PURCHASES_PAUSED).toBe(true);
  });

  it.each([
    ["the organization's owner, one Standard seat", { organizationId: ORG, seatTier: "standard", seats: 1 }],
    ["the owner, one Premium seat", { organizationId: ORG, seatTier: "premium", seats: 1 }],
    ["the owner, the most seats one order allows", { organizationId: ORG, seatTier: "standard", seats: 100 }],
    ["a request that names no seat count", { organizationId: ORG, seatTier: "standard" }],
    ["a request with extra fields trying to open it", { organizationId: ORG, seatTier: "standard", seats: 1, paused: false, force: true, admin: true, override: "yes" }],
    ["a malformed request", { organizationId: "nope", seatTier: "gold", seats: -3 }],
  ])("%s: refused, and no order is created with the payment processor", async (_name, body) => {
    const response = await post({ accessToken: "token", ...body });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: SEAT_PURCHASES_PAUSED_CODE, reason: SEAT_PURCHASES_PAUSED_REASON });
    // Nothing went to Razorpay, nothing was priced, and nothing was read or written about the organization.
    expect(outbound).toEqual([]);
    expect(state.tableReads).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("the response carries no order, key or amount — nothing a client could open a checkout with", async () => {
    const body = (await (await post({ accessToken: "token", organizationId: ORG, seatTier: "standard", seats: 1 })).json()) as Record<string, unknown>;
    for (const field of ["orderId", "checkoutUrl", "keyId", "amountPaise", "amountInr", "amountUsd"]) expect(body[field]).toBeUndefined();
  });

  it("a caller who is not signed in is told to sign in, not about the pause", async () => {
    expect((await post({ organizationId: ORG, seatTier: "standard", seats: 1 })).status).toBe(401);
    state.user = null;
    const response = await post({ accessToken: "bad", organizationId: ORG, seatTier: "standard", seats: 1 });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("paused");
    expect(outbound).toEqual([]);
  });

  it("the message says existing seats are unaffected and where to ask for more — on PawOS's own domain", () => {
    expect(SEAT_PURCHASES_PAUSED_REASON).toMatch(/current seats and members are not affected/);
    expect(SEAT_PURCHASES_PAUSED_REASON).toContain("https://pawos.revantaai.com/support/sales");
    expect(fs.existsSync(path.join(process.cwd(), "src/app/support/sales/page.tsx"))).toBe(true);
  });
});

describe("there is no other way to create a seat order, or to add seats without a verified payment", () => {
  const api = path.join(process.cwd(), "src/app/api");
  const routes = (function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name === "route.ts" ? [path.join(dir, entry.name)] : []));
  })(api);
  const rel = (file: string) => path.relative(api, file).replace(/\\/g, "/");
  const source = (file: string) => fs.readFileSync(file, "utf8");

  it("only this route builds a seat order, and it checks the pause before it does", () => {
    expect(routes.filter((file) => /buildSeatOrder/.test(source(file))).map(rel)).toEqual(["billing/checkout-seat/route.ts"]);
    const route = source(path.join(api, "billing/checkout-seat/route.ts"));
    const pause = route.indexOf("if (ADDITIONAL_SEAT_PURCHASES_PAUSED)");
    expect(pause).toBeGreaterThan(-1);
    expect(pause).toBeLessThan(route.indexOf("await buildSeatOrder("));
    expect(pause).toBeLessThan(route.indexOf("api.razorpay.com"));
  });

  it("seats are only ever added from a verified payment: by the verify route and the webhook", () => {
    expect(routes.filter((file) => /applyVerifiedSeatPayment/.test(source(file))).map(rel).sort()).toEqual(["billing/verify-seat-payment/route.ts", "billing/webhook/route.ts"]);
    // No route calls the database's seat function itself.
    expect(routes.filter((file) => /pawos_apply_seat_purchase/.test(source(file))).map(rel)).toEqual([]);
  });

  it("the plan checkouts still refuse Team and Enterprise, so no new organization plan order can be created either", () => {
    for (const route of ["billing/checkout/route.ts", "billing/checkout-tier/route.ts"]) {
      const text = source(path.join(api, route));
      const gate = text.indexOf("Commercial Availability Gate");
      expect(gate, route).toBeGreaterThan(-1);
      expect(text.slice(gate, gate + 320), route).toMatch(/"team"[\s\S]*"enterprise"[\s\S]*coming soon[\s\S]*503/);
      expect(gate, route).toBeLessThan(text.indexOf("api.razorpay.com"));
    }
  });

  it("the pause touches nothing that exists: this route makes no database write at all", () => {
    const route = source(path.join(api, "billing/checkout-seat/route.ts"));
    expect(route).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
