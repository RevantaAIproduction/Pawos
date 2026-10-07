import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  fetchRazorpayPayment: vi.fn(),
  fetchRazorpayOrder: vi.fn(),
  verifySignature: vi.fn(() => true),
  rpc: vi.fn(),
}));

vi.mock("@/lib/billing/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/razorpay")>()),
  getRazorpayCredentials: () => ({ keyId: "rzp_key", keySecret: "rzp_secret" }),
  fetchRazorpayPayment: mocks.fetchRazorpayPayment,
  fetchRazorpayOrder: mocks.fetchRazorpayOrder,
  verifyRazorpayOrderPaymentSignature: mocks.verifySignature,
}));
vi.mock("@/lib/supabase/serviceClient", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));

import { SEAT_PRODUCT_TYPE, TEAM_SEAT_PRICE_PAISE, applyVerifiedSeatPayment, buildSeatOrder } from "./seatPurchase";

/**
 * Additional Team seats: the order is priced and bound to an organization by the server, and seats
 * are added only from a verified payment, using what the order says — never what the request says.
 */
const ORG = "99999999-9999-4999-8999-999999999999";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OTHER = "11111111-1111-4111-8111-111111111111";

/** The caller's own view of the database (row level security already applied). */
function callerClient(view: { organization?: { tier: string; owner_user_id: string } | null; role?: string | null }): SupabaseClient {
  const table = (name: string) => {
    const row = name === "organizations" ? (view.organization ? { id: ORG, ...view.organization } : null) : view.role ? { role: view.role } : null;
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
    return chain;
  };
  return { from: table } as unknown as SupabaseClient;
}
const team = { tier: "team", owner_user_id: OWNER };
const notes = (overrides: Record<string, string> = {}) => ({ productType: SEAT_PRODUCT_TYPE, organizationId: ORG, seatTier: "standard", seats: "1", userId: OWNER, ...overrides });
const standardPaise = TEAM_SEAT_PRICE_PAISE.standard;
const premiumPaise = TEAM_SEAT_PRICE_PAISE.premium;

beforeEach(() => {
  mocks.fetchRazorpayPayment.mockReset().mockResolvedValue({ id: "pay_1", order_id: "order_1", status: "captured", amount: standardPaise, currency: "INR" });
  mocks.fetchRazorpayOrder.mockReset().mockResolvedValue({ id: "order_1", amount: standardPaise, currency: "INR", status: "paid", notes: notes() });
  mocks.rpc.mockReset().mockResolvedValue({ data: { applied: true, seatCount: 4, paidPremiumSeats: 0 }, error: null });
  mocks.verifySignature.mockReset().mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("buildSeatOrder", () => {
  it("prices a Standard seat on the server and binds the order to the organization and buyer", async () => {
    const order = await buildSeatOrder({ callerClient: callerClient({ organization: team, role: "owner" }), userId: OWNER, organizationId: ORG, seatTier: "standard", seats: 1 });
    expect(order).toMatchObject({ ok: true, amountPaise: standardPaise });
    if (order.ok) expect(order.payload.notes).toEqual({ productType: "seat_purchase", organizationId: ORG, seatTier: "standard", seats: "1", amountPaise: String(standardPaise), userId: OWNER });
  });

  it("prices Premium seats and multiplies by the quantity", async () => {
    const order = await buildSeatOrder({ callerClient: callerClient({ organization: team, role: "billingAdministrator" }), userId: OTHER, organizationId: ORG, seatTier: "premium", seats: 3 });
    expect(order).toMatchObject({ ok: true, amountPaise: premiumPaise * 3 });
  });

  it("refuses someone who does not manage the organization", async () => {
    for (const role of ["member", "workspaceAdministrator", null]) {
      const order = await buildSeatOrder({ callerClient: callerClient({ organization: team, role }), userId: OTHER, organizationId: ORG, seatTier: "standard", seats: 1 });
      expect(order, String(role)).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("refuses an organization the caller cannot see, and organizations not on Paw Team", async () => {
    expect(await buildSeatOrder({ callerClient: callerClient({ organization: null }), userId: OWNER, organizationId: ORG, seatTier: "standard", seats: 1 })).toMatchObject({ ok: false, status: 404 });
    for (const tier of ["go", "enterprise"]) {
      const order = await buildSeatOrder({ callerClient: callerClient({ organization: { tier, owner_user_id: OWNER } }), userId: OWNER, organizationId: ORG, seatTier: "standard", seats: 1 });
      expect(order, tier).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("refuses bad input: organization id, seat tier, quantity", async () => {
    const client = callerClient({ organization: team, role: "owner" });
    const base = { callerClient: client, userId: OWNER, organizationId: ORG, seatTier: "standard", seats: 1 };
    for (const bad of [{ organizationId: "not-a-uuid" }, { organizationId: undefined }, { seatTier: "ultra" }, { seats: 0 }, { seats: -1 }, { seats: 1.5 }, { seats: 101 }, { seats: "2" }]) {
      expect(await buildSeatOrder({ ...base, ...bad }), JSON.stringify(bad)).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe("applyVerifiedSeatPayment", () => {
  const ask = (overrides: Record<string, unknown> = {}) => applyVerifiedSeatPayment({ orderId: "order_1", paymentId: "pay_1", signature: "sig", callerUserId: OWNER, ...overrides });

  it("adds the seats on the order to the organization on the order", async () => {
    const result = await ask();
    expect(result).toMatchObject({ ok: true, applied: true, organizationId: ORG, seatTier: "standard", seats: 1, seatCount: 4 });
    expect(mocks.rpc).toHaveBeenCalledWith("pawos_apply_seat_purchase", {
      p_payment_id: "pay_1",
      p_order_id: "order_1",
      p_organization_id: ORG,
      p_buyer_user_id: OWNER,
      p_seat_tier: "standard",
      p_seats: 1,
    });
  });

  it("adds Premium seats when Premium seats were paid for", async () => {
    mocks.fetchRazorpayPayment.mockResolvedValue({ id: "pay_1", order_id: "order_1", status: "captured", amount: premiumPaise * 2, currency: "INR" });
    mocks.fetchRazorpayOrder.mockResolvedValue({ id: "order_1", amount: premiumPaise * 2, currency: "INR", status: "paid", notes: notes({ seatTier: "premium", seats: "2" }) });
    expect(await ask()).toMatchObject({ ok: true, seatTier: "premium", seats: 2 });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_seat_tier: "premium", p_seats: 2 });
  });

  it("reports a repeat verification as already applied (the database adds a payment's seats once)", async () => {
    mocks.rpc.mockResolvedValue({ data: { applied: false, seatCount: 4, paidPremiumSeats: 0 }, error: null });
    expect(await ask()).toMatchObject({ ok: true, applied: false, seatCount: 4 });
  });

  it("takes nothing from the request: extra fields naming another organization or more seats are ignored", async () => {
    await ask({ organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seats: 50, seatTier: "premium" });
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_organization_id: ORG, p_seats: 1, p_seat_tier: "standard" });
  });

  it("refuses a forged or missing signature", async () => {
    mocks.verifySignature.mockReturnValue(false);
    expect(await ask()).toMatchObject({ ok: false, status: 400 });
    expect(await ask({ signature: "" })).toMatchObject({ ok: false, status: 400 });
    expect(mocks.fetchRazorpayPayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["a payment that is only authorized", { status: "authorized" }],
    ["a failed payment", { status: "failed" }],
    ["a payment for another order", { order_id: "order_other" }],
    ["a payment in another currency", { currency: "USD" }],
  ])("refuses %s", async (_name, payment) => {
    mocks.fetchRazorpayPayment.mockResolvedValue({ id: "pay_1", order_id: "order_1", status: "captured", amount: standardPaise, currency: "INR", ...payment });
    expect((await ask()).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses an order that is not paid, not a seat order, or missing its details", async () => {
    const cases = [
      { status: "created" },
      { notes: notes({ productType: "usage_credits" }) },
      { notes: notes({ organizationId: "not-a-uuid" }) },
      { notes: notes({ seatTier: "ultra" }) },
      { notes: notes({ seats: "0" }) },
      { notes: notes({ seats: "500" }) },
      { notes: notes({ userId: "" }) },
    ];
    for (const order of cases) {
      mocks.fetchRazorpayOrder.mockResolvedValue({ id: "order_1", amount: standardPaise, currency: "INR", status: "paid", notes: notes(), ...order });
      expect((await ask()).ok, JSON.stringify(order)).toBe(false);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses a payment whose amount does not cover the seats on the order (a Standard payment cannot buy Premium, or more seats)", async () => {
    mocks.fetchRazorpayOrder.mockResolvedValue({ id: "order_1", amount: standardPaise, currency: "INR", status: "paid", notes: notes({ seatTier: "premium" }) });
    expect(await ask()).toMatchObject({ ok: false, status: 400 });
    mocks.fetchRazorpayOrder.mockResolvedValue({ id: "order_1", amount: standardPaise, currency: "INR", status: "paid", notes: notes({ seats: "5" }) });
    expect(await ask()).toMatchObject({ ok: false, status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses a signed-in caller who is not the buyer on the order", async () => {
    expect(await ask({ callerUserId: OTHER })).toMatchObject({ ok: false, status: 403 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("applies from the webhook without a caller or signature, still from the order's notes", async () => {
    const result = await applyVerifiedSeatPayment({ orderId: "order_1", paymentId: "pay_1" });
    expect(result).toMatchObject({ ok: true, organizationId: ORG });
    expect(mocks.verifySignature).not.toHaveBeenCalled();
  });

  it("reports a retryable failure when the seats could not be written", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "buyer_does_not_manage_organization" } });
    expect(await ask()).toMatchObject({ ok: false, status: 500 });
  });
});
