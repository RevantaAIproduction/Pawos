import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { buildMidMonthOrderPayload, creditVerifiedMidMonthPayment, getMidMonthOffer } from "./midMonthPurchase";
import { calculateTicketBalanceInrPayment } from "./razorpay";

const offer = { productKey: "pro_mid_month", planBucketId: "plan-b-1", priceCents: 1500, pc: 1500, label: "Pro extra usage", expiresAt: "2026-10-30T00:00:00Z" };
const paise = calculateTicketBalanceInrPayment(15)!.amountPaise;
const orderNotes = { productType: "mid_month_purchase", productKey: "pro_mid_month", planBucketId: "plan-b-1", amountCents: "1500", userId: "user-1" };

beforeEach(() => {
  mocks.fetchRazorpayPayment.mockReset().mockResolvedValue({ id: "pay_1", order_id: "order_1", status: "captured", amount: paise, currency: "INR" });
  mocks.fetchRazorpayOrder.mockReset().mockResolvedValue({ id: "order_1", amount: paise, currency: "INR", status: "paid", notes: orderNotes });
  mocks.rpc.mockReset().mockResolvedValue({ data: { bucketId: "b-mid", expiresAt: offer.expiresAt }, error: null });
  mocks.verifySignature.mockReset().mockReturnValue(true);
});

describe("mid-month purchase", () => {
  it("stamps the server-chosen product, plan and price into the order notes", () => {
    const built = buildMidMonthOrderPayload(offer, "user-1");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.amountUsd).toBe(15);
    expect(built.payload.notes).toMatchObject({ productType: "mid_month_purchase", productKey: "pro_mid_month", planBucketId: "plan-b-1", amountCents: "1500", userId: "user-1" });
  });

  it("reads the offer from the database for the user (null without an active plan)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: offer, error: null });
    expect(await getMidMonthOffer("user-1")).toEqual(offer);
    expect(mocks.rpc).toHaveBeenCalledWith("pawos_mid_month_offer", { p_user_id: "user-1" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await getMidMonthOffer("user-2")).toBeNull();
  });

  it("grants the bucket from the order's own notes after full verification", async () => {
    const result = await creditVerifiedMidMonthPayment({ orderId: "order_1", paymentId: "pay_1", signature: "sig", identity: { source: "callerToken", userId: "user-1" } });
    expect(result).toEqual({ ok: true, pc: 1500, expiresAt: offer.expiresAt });
    expect(mocks.rpc).toHaveBeenCalledWith("grant_mid_month_bucket_service", {
      p_user_id: "user-1", p_razorpay_payment_id: "pay_1", p_product_key: "pro_mid_month", p_plan_bucket_id: "plan-b-1", p_amount_cents: 1500,
    });
  });

  it("rejects a bad signature, an uncaptured payment, another product, a wrong amount, or another user's payment", async () => {
    const call = (identity: { source: "callerToken"; userId: string } | { source: "orderNotes" } = { source: "callerToken", userId: "user-1" }) =>
      creditVerifiedMidMonthPayment({ orderId: "order_1", paymentId: "pay_1", signature: "sig", identity });

    mocks.verifySignature.mockReturnValueOnce(false);
    expect((await call()).status).toBe(400);

    mocks.fetchRazorpayPayment.mockResolvedValueOnce({ id: "pay_1", order_id: "order_1", status: "authorized", amount: paise, currency: "INR" });
    expect((await call()).ok).toBe(false);

    mocks.fetchRazorpayOrder.mockResolvedValueOnce({ id: "order_1", amount: paise, currency: "INR", status: "paid", notes: { ...orderNotes, productType: "usage_credits" } });
    expect((await call()).reason).toMatch(/not a mid-month/);

    mocks.fetchRazorpayOrder.mockResolvedValueOnce({ id: "order_1", amount: paise, currency: "INR", status: "paid", notes: { ...orderNotes, amountCents: "100" } });
    expect((await call()).reason).toMatch(/does not match/);

    expect((await call({ source: "callerToken", userId: "someone-else" })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a payment whose plan period already ended is surfaced for a refund, never converted to another product", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "plan period has ended" } });
    const result = await creditVerifiedMidMonthPayment({ orderId: "order_1", paymentId: "pay_1", signature: "", identity: { source: "orderNotes" } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.reason).toMatch(/refund/);
  });
});
