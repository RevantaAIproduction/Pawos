import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));

import { POST } from "./route";

const req = (body: unknown) => new Request("https://pawos.test/api/billing/checkout-credits", { method: "POST", body: JSON.stringify(body) });

describe("Ticket Balance checkout — maintenance switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "order_1" }), { status: 200 }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("takes no payment while top-ups are switched off", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(req({ accessToken: "tok", amountUsd: 30 }));
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toMatch(/paused/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails closed if the switch can't be read", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(req({ accessToken: "tok", amountUsd: 30 }))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("creates the Razorpay order once top-ups are on", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const res = await POST(req({ accessToken: "tok", amountUsd: 30 }));
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("pawos_billing_switch", { p_key: "ticket_topups" });
    expect(mocks.fetch).toHaveBeenCalledWith("https://api.razorpay.com/v1/orders", expect.anything());
  });
});
