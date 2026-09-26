import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  listRazorpayInvoices: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/billing/razorpay", () => ({
  getRazorpayCredentials: () => ({ keyId: "k", keySecret: "s" }),
  listRazorpayInvoices: mocks.listRazorpayInvoices,
}));
vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: mocks.eq }) }) }),
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("https://pawos.test/api/billing/invoices", { method: "POST", body: JSON.stringify(body) });

describe("account invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("lists invoices of the caller's own subscriptions only, newest first, without drafts", async () => {
    mocks.eq.mockResolvedValue({ data: [{ id: "sub_a" }, { id: "sub_b" }], error: null });
    mocks.listRazorpayInvoices
      .mockResolvedValueOnce([
        { id: "inv_1", subscription_id: "sub_a", status: "paid", amount: 200000, currency: "INR", paid_at: 1_700_000_000, short_url: "https://rzp.io/i/1" },
        { id: "inv_draft", subscription_id: "sub_a", status: "draft", amount: 200000, currency: "INR", issued_at: 1_800_000_000 },
      ])
      .mockResolvedValueOnce([
        { id: "inv_2", subscription_id: "sub_b", status: "issued", amount: 950000, currency: "INR", issued_at: 1_750_000_000, short_url: "" },
      ]);

    const res = await POST(req({ accessToken: "tok" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      invoices: [
        { id: "inv_2", date: 1_750_000_000_000, amount: 950000, currency: "INR", status: "issued", url: null },
        { id: "inv_1", date: 1_700_000_000_000, amount: 200000, currency: "INR", status: "paid", url: "https://rzp.io/i/1" },
      ],
    });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.listRazorpayInvoices).toHaveBeenCalledWith({ keyId: "k", keySecret: "s" }, "sub_a");
  });

  it("no subscriptions → no invoices", async () => {
    mocks.eq.mockResolvedValue({ data: [], error: null });
    expect(await (await POST(req({ accessToken: "tok" }))).json()).toEqual({ ok: true, invoices: [] });
  });

  it("refuses without a valid session", async () => {
    expect((await POST(req({}))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await POST(req({ accessToken: "bad" }))).status).toBe(401);
    expect(mocks.listRazorpayInvoices).not.toHaveBeenCalled();
  });

  it("Razorpay unreadable → 502, not an empty list", async () => {
    mocks.eq.mockResolvedValue({ data: [{ id: "sub_a" }], error: null });
    mocks.listRazorpayInvoices.mockResolvedValueOnce(null);
    expect((await POST(req({ accessToken: "tok" }))).status).toBe(502);
  });
});
