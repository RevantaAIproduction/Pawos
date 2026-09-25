import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listRazorpaySubscriptions: vi.fn(),
  recordRazorpaySubscription: vi.fn(async () => "recorded"),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/billing/razorpay", () => ({
  getRazorpayCredentials: () => ({ keyId: "k", keySecret: "s" }),
  listRazorpaySubscriptions: mocks.listRazorpaySubscriptions,
}));

vi.mock("@/lib/billing/subscriptionRecords", () => ({
  recordRazorpaySubscription: mocks.recordRazorpaySubscription,
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("https://pawos.test/api/billing/restore-subscription", { method: "POST", body: JSON.stringify(body) });

describe("restore-subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("records only subscriptions that belong to the signed-in account", async () => {
    mocks.listRazorpaySubscriptions.mockResolvedValueOnce([
      { id: "sub_mine", plan_id: "p", status: "active", notes: { userId: "user-1" } },
      { id: "sub_other", plan_id: "p", status: "active", notes: { userId: "user-2" } },
      { id: "sub_none", plan_id: "p", status: "active" },
    ]);
    const res = await POST(req({ accessToken: "tok" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: 1 });
    expect(mocks.recordRazorpaySubscription).toHaveBeenCalledTimes(1);
    expect(mocks.recordRazorpaySubscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_mine" }), "restore-subscription");
  });

  it("pages through Razorpay until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, plan_id: "p", status: "active", notes: { userId: "user-1" } }));
    mocks.listRazorpaySubscriptions.mockResolvedValueOnce(full).mockResolvedValueOnce([]);
    const res = await POST(req({ accessToken: "tok" }));
    expect(await res.json()).toEqual({ ok: true, recorded: 100 });
    expect(mocks.listRazorpaySubscriptions).toHaveBeenNthCalledWith(2, { keyId: "k", keySecret: "s" }, { count: 100, skip: 100 });
  });

  it("refuses without a valid session", async () => {
    expect((await POST(req({}))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await POST(req({ accessToken: "bad" }))).status).toBe(401);
    expect(mocks.listRazorpaySubscriptions).not.toHaveBeenCalled();
  });
});
