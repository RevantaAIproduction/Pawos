import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting an account from Settings: code by email → confirm → delete. Never while money is owed
 * or while the account owns an organization; paid-up subscriptions are cancelled first, and a
 * failed cancellation leaves the account in place. Supabase, Razorpay and SMTP are fakes.
 */
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  signedIn: true,
  userId: "user-0",
  tables: {} as Record<string, Row[]>,
  deletedUsers: [] as string[],
  cookie: undefined as string | undefined,
  sentCodes: [] as string[],
  deletedEmails: [] as string[],
  razorpay: { invoices: [] as Row[], cancelOk: true, cancelled: [] as string[] },
  signedOut: false,
}));

function query(table: string) {
  let rows = [...(state.tables[table] ?? [])];
  const builder = {
    select: () => builder,
    eq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] === value)), builder),
    in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), builder),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return builder;
}

vi.mock("../../../../lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({
    from: query,
    auth: { admin: { deleteUser: async (id: string) => (state.deletedUsers.push(id), { error: null }) } },
  }),
}));
vi.mock("../../../../lib/account/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../lib/account/api")>();
  return {
    ...original,
    requireAccount: async () =>
      state.signedIn
        ? { ok: true, account: { user: { id: state.userId, email: "Ada@Example.com" }, supabase: { auth: { signOut: async () => ((state.signedOut = true), {}) } } } }
        : { ok: false, response: Response.json({ ok: false }, { status: 401 }) },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (state.cookie ? { name, value: state.cookie } : undefined) }) }));
vi.mock("../../../../lib/mail/accountMailer", () => ({
  sendAccountDeleteCodeEmail: async (_email: string, code: string) => (state.sentCodes.push(code), true),
  sendAccountDeletedEmail: async (email: string) => void state.deletedEmails.push(email),
}));

import { DELETE as deleteAccountRoute } from "./route";
import { POST as requestCode } from "./delete-code/route";

const HOST = "pawos.test";
const req = (method: string, body?: unknown) =>
  new Request(`https://${HOST}/api/dashboard/account`, { method, headers: { host: HOST, origin: `https://${HOST}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function getCode(): Promise<string> {
  const response = await requestCode(req("POST"));
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  state.cookie = /pawos_account_delete=([^;]+)/.exec(setCookie)?.[1];
  return state.sentCodes.at(-1)!;
}

let userCounter = 0;
beforeEach(() => {
  state.userId = `user-${++userCounter}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.RAZORPAY_KEY_ID = "rzp_test";
  process.env.RAZORPAY_KEY_SECRET = "rzp_secret";
  Object.assign(state, { signedIn: true, tables: { organizations: [], billing_cases: [], pawos_subscriptions: [] }, deletedUsers: [], cookie: undefined, sentCodes: [], deletedEmails: [], signedOut: false });
  state.razorpay = { invoices: [], cancelOk: true, cancelled: [] };
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v1/invoices")) return Response.json({ items: state.razorpay.invoices });
    const cancel = /\/v1\/subscriptions\/([^/]+)\/cancel$/.exec(url);
    if (cancel && init?.method === "POST") {
      if (!state.razorpay.cancelOk) return Response.json({ error: { description: "Server error" } }, { status: 500 });
      state.razorpay.cancelled.push(decodeURIComponent(cancel[1]));
      return Response.json({ id: cancel[1], status: "cancelled" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
});

describe("delete account", () => {
  it("signed out: refused", async () => {
    state.signedIn = false;
    expect((await requestCode(req("POST"))).status).toBe(401);
    expect((await deleteAccountRoute(req("DELETE", { code: "123456", confirmEmail: "ada@example.com" }))).status).toBe(401);
    expect(state.deletedUsers).toEqual([]);
  });

  it("free account: code → confirm → deleted, confirmation emailed, signed out", async () => {
    const code = await getCode();
    expect(code).toMatch(/^\d{6}$/);
    const response = await deleteAccountRoute(req("DELETE", { code, confirmEmail: "ada@example.com" }));
    expect(response.status).toBe(200);
    expect(state.deletedUsers).toEqual([state.userId]);
    expect(state.deletedEmails).toEqual(["Ada@Example.com"]);
    expect(state.signedOut).toBe(true);
  });

  it("paid-up subscription: cancelled at Razorpay, then the account is deleted", async () => {
    state.tables.pawos_subscriptions = [{ id: "sub_1", user_id: state.userId, status: "active" }];
    state.razorpay.invoices = [{ id: "inv_1", subscription_id: "sub_1", status: "paid", amount: 99900, currency: "INR" }];
    const code = await getCode();
    expect((await deleteAccountRoute(req("DELETE", { code, confirmEmail: "ada@example.com" }))).status).toBe(200);
    expect(state.razorpay.cancelled).toEqual(["sub_1"]);
    expect(state.deletedUsers).toEqual([state.userId]);
  });

  it("if the subscription can't be cancelled, the account is NOT deleted", async () => {
    state.tables.pawos_subscriptions = [{ id: "sub_1", user_id: state.userId, status: "active" }];
    state.razorpay.cancelOk = false;
    const code = await getCode();
    const response = await deleteAccountRoute(req("DELETE", { code, confirmEmail: "ada@example.com" }));
    expect(response.status).toBe(503);
    expect(state.deletedUsers).toEqual([]);
  });

  it("unpaid invoice: no code is sent, the reason is listed, the account stays", async () => {
    state.tables.pawos_subscriptions = [{ id: "sub_1", user_id: state.userId, status: "active" }];
    state.razorpay.invoices = [{ id: "inv_9", subscription_id: "sub_1", status: "issued", amount: 99900, currency: "INR", short_url: "https://rzp.io/i/abc" }];
    const response = await requestCode(req("POST"));
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.blockers[0].code).toBe("unpaid_invoice");
    expect(data.blockers[0].message).toContain("https://rzp.io/i/abc");
    expect(state.sentCodes).toEqual([]);
    expect(state.deletedUsers).toEqual([]);
  });

  it("failed renewal (halted subscription) and unpaid billing case both block deletion", async () => {
    state.tables.pawos_subscriptions = [{ id: "sub_2", user_id: state.userId, status: "halted" }];
    state.tables.billing_cases = [{ id: "CASE-7", user_id: state.userId, usd_total: 1200, payment_status: "pending", validation_status: "awaiting_review" }];
    const data = await (await requestCode(req("POST"))).json();
    expect(data.blockers.map((b: { code: string }) => b.code).sort()).toEqual(["payment_due", "unpaid_billing_case"]);
  });

  it("a payment that falls due after the code was sent still stops the delete", async () => {
    const code = await getCode();
    state.tables.billing_cases = [{ id: "CASE-8", user_id: state.userId, usd_total: 50, payment_status: "unpaid", validation_status: null }];
    const response = await deleteAccountRoute(req("DELETE", { code, confirmEmail: "ada@example.com" }));
    expect(response.status).toBe(409);
    expect(state.deletedUsers).toEqual([]);
  });

  it("organization owner: blocked", async () => {
    state.tables.organizations = [{ name: "Acme", owner_user_id: state.userId }];
    const data = await (await requestCode(req("POST"))).json();
    expect(data.blockers[0].code).toBe("owns_organization");
  });

  it("wrong code: refused and the code is spent; wrong email: refused", async () => {
    const code = await getCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await deleteAccountRoute(req("DELETE", { code: wrong, confirmEmail: "ada@example.com" }));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("set-cookie")).toContain("pawos_account_delete=;");
    expect((await deleteAccountRoute(req("DELETE", { code, confirmEmail: "someone@else.com" }))).status).toBe(400);
    expect(state.deletedUsers).toEqual([]);
  });

  it("no code requested (no cookie): refused", async () => {
    expect((await deleteAccountRoute(req("DELETE", { code: "123456", confirmEmail: "ada@example.com" }))).status).toBe(400);
    expect(state.deletedUsers).toEqual([]);
  });

  it("expired code: refused", async () => {
    const code = await getCode();
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    try {
      const data = await (await deleteAccountRoute(req("DELETE", { code, confirmEmail: "ada@example.com" }))).json();
      expect(data.code).toBe("code_expired");
    } finally {
      Date.now = realNow;
    }
    expect(state.deletedUsers).toEqual([]);
  });

  it("at most 5 codes per 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await getCode();
    expect((await requestCode(req("POST"))).status).toBe(429);
  });

  it("cross-site request: refused", async () => {
    const response = await requestCode(new Request(`https://${HOST}/x`, { method: "POST", headers: { host: HOST, origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
  });
});
