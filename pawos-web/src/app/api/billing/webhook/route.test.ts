import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "webhook_secret";

const mocks = vi.hoisted(() => ({
  creditVerifiedTicketBalancePayment: vi.fn(),
  creditVerifiedUsageCreditsPayment: vi.fn(),
  fetchRazorpaySubscription: vi.fn(),
  getRazorpayCredentials: vi.fn(() => ({ keyId: "rzp_key", keySecret: "rzp_secret" })),
  recordRazorpaySubscription: vi.fn(async () => "recorded"),
  creditPaidInvoice: vi.fn(),
  fetchRazorpayInvoice: vi.fn(),
  creditVerifiedMidMonthPayment: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/billing/invoiceCrediting", () => ({
  creditPaidInvoice: mocks.creditPaidInvoice,
  fetchRazorpayInvoice: mocks.fetchRazorpayInvoice,
}));

vi.mock("@/lib/billing/midMonthPurchase", () => ({
  MID_MONTH_PRODUCT_TYPE: "mid_month_purchase",
  creditVerifiedMidMonthPayment: mocks.creditVerifiedMidMonthPayment,
}));

vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/lib/billing/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/razorpay")>()),
  fetchRazorpaySubscription: mocks.fetchRazorpaySubscription,
  getRazorpayCredentials: mocks.getRazorpayCredentials,
}));

vi.mock("@/lib/billing/subscriptionRecords", () => ({
  recordRazorpaySubscription: mocks.recordRazorpaySubscription,
}));

vi.mock("@/lib/billing/ticketBalanceCrediting", () => ({
  creditVerifiedTicketBalancePayment: mocks.creditVerifiedTicketBalancePayment,
}));

vi.mock("@/lib/billing/usageCreditsCrediting", () => ({
  creditVerifiedUsageCreditsPayment: mocks.creditVerifiedUsageCreditsPayment,
}));

import { POST } from "./route";

function signatureFor(rawBody: string): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

function requestFor(body: unknown, signature?: string): Request {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://pawos.test/api/billing/webhook", {
    method: "POST",
    body: rawBody,
    headers: signature ? { "x-razorpay-signature": signature } : {},
  });
}

const capturedEvent = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_115",
        order_id: "order_115",
        amount: 1099975,
        currency: "INR",
      },
    },
  },
};

beforeEach(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  mocks.creditVerifiedTicketBalancePayment.mockReset();
  mocks.creditVerifiedUsageCreditsPayment.mockReset();
  mocks.creditVerifiedMidMonthPayment.mockReset();
  mocks.fetchRazorpayInvoice.mockReset();
  mocks.rpc.mockReset();
});

describe("Razorpay billing webhook", () => {
  it("rejects unsigned or incorrectly signed webhook payloads before dispatch", async () => {
    const response = await POST(requestFor(capturedEvent, "bad-signature"));

    expect(response.status).toBe(400);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("dispatches payment.captured to the shared idempotent Ticket Balance crediting helper", async () => {
    mocks.creditVerifiedTicketBalancePayment.mockResolvedValue({ ok: true, amountUsd: 115, topupId: "topup-1" });
    const rawBody = JSON.stringify(capturedEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).toHaveBeenCalledWith({
      orderId: "order_115",
      paymentId: "pay_115",
      signature: "",
      identity: { source: "orderNotes" },
    });
  });

  it("returns idempotent success when the shared helper reports an already-reconciled/no-op outcome", async () => {
    mocks.creditVerifiedTicketBalancePayment.mockResolvedValue({ ok: false, reason: "already credited" });
    const rawBody = JSON.stringify(capturedEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).toHaveBeenCalledTimes(1);
  });

  it("asks Razorpay to retry when crediting failed on our side (database/config/Razorpay lookup)", async () => {
    const rawBody = JSON.stringify(capturedEvent);
    for (const status of [500, 502, 503]) {
      mocks.creditVerifiedTicketBalancePayment.mockResolvedValueOnce({ ok: false, status, reason: "Failed to credit balance: relation does not exist" });
      expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(500);
    }
    mocks.creditVerifiedTicketBalancePayment.mockRejectedValueOnce(new Error("network down"));
    expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(500);
  });

  it("does not retry a permanent rejection (wrong amount, not captured, bad identity)", async () => {
    const rawBody = JSON.stringify(capturedEvent);
    mocks.creditVerifiedTicketBalancePayment.mockResolvedValueOnce({ ok: false, status: 400, reason: "Payment amount does not match" });
    expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(200);
  });

  it("does not credit on payment.failed", async () => {
    const failedEvent = {
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_failed", order_id: "order_failed", amount: 1099975, currency: "INR" } } },
    };
    const rawBody = JSON.stringify(failedEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("accepts subscription events without invoking one-time crediting, recording the plan's CURRENT state from Razorpay", async () => {
    const current = { id: "sub_123", plan_id: "plan_pro", status: "active", current_end: 1_800_000_000, notes: { userId: "user-1" } };
    mocks.fetchRazorpaySubscription.mockResolvedValue(current);
    const subscriptionEvent = {
      event: "subscription.charged",
      // A stale payload status must not be what gets stored — the re-fetched subscription is.
      payload: { subscription: { entity: { id: "sub_123", status: "created" } } },
    };
    const rawBody = JSON.stringify(subscriptionEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
    expect(mocks.fetchRazorpaySubscription).toHaveBeenCalledWith("sub_123", { keyId: "rzp_key", keySecret: "rzp_secret" });
    expect(mocks.recordRazorpaySubscription).toHaveBeenCalledWith(current, "webhook:subscription.charged");
  });

  it("asks Razorpay to retry (500) when the subscription can't be re-fetched or stored", async () => {
    const rawBody = JSON.stringify({ event: "subscription.cancelled", payload: { subscription: { entity: { id: "sub_9" } } } });
    mocks.fetchRazorpaySubscription.mockResolvedValue(null);
    expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(500);

    mocks.fetchRazorpaySubscription.mockResolvedValue({ id: "sub_9", plan_id: "plan_pro", status: "cancelled", notes: { userId: "u" } });
    mocks.recordRazorpaySubscription.mockResolvedValueOnce("failed");
    expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(500);

    mocks.recordRazorpaySubscription.mockResolvedValueOnce("skipped"); // e.g. a Team plan — nothing to store, no retry
    expect((await POST(requestFor(rawBody, signatureFor(rawBody)))).status).toBe(200);
  });

  it("rejects malformed JSON after signature verification", async () => {
    const rawBody = "{not json";

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(400);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("dispatches payment.captured with productType='usage_credits' to usage-credits crediting, never ticket-balance", async () => {
    mocks.creditVerifiedUsageCreditsPayment.mockResolvedValue({ ok: true, amountUsd: 30, topupId: "uc-topup-1" });
    const usageCreditsEvent = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_uc_001",
            order_id: "order_uc_001",
            amount: 286950,
            currency: "INR",
            notes: { productType: "usage_credits", userId: "user-1", amountUsd: "30.00" },
          },
        },
      },
    };
    const rawBody = JSON.stringify(usageCreditsEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedUsageCreditsPayment).toHaveBeenCalledWith({
      orderId: "order_uc_001",
      paymentId: "pay_uc_001",
      signature: "",
      identity: { source: "orderNotes" },
    });
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("dispatches payment.captured with productType='ticket_balance' to ticket-balance crediting, never usage-credits", async () => {
    mocks.creditVerifiedTicketBalancePayment.mockResolvedValue({ ok: true, amountUsd: 115, topupId: "tb-topup-1" });
    const ticketBalanceEvent = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_tb_002",
            order_id: "order_tb_002",
            amount: 1099975,
            currency: "INR",
            notes: { productType: "ticket_balance", userId: "user-1", amountUsd: "115.00" },
          },
        },
      },
    };
    const rawBody = JSON.stringify(ticketBalanceEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).toHaveBeenCalledWith({
      orderId: "order_tb_002",
      paymentId: "pay_tb_002",
      signature: "",
      identity: { source: "orderNotes" },
    });
    expect(mocks.creditVerifiedUsageCreditsPayment).not.toHaveBeenCalled();
  });

  it("legacy orders without productType default to ticket-balance crediting", async () => {
    mocks.creditVerifiedTicketBalancePayment.mockResolvedValue({ ok: true, amountUsd: 115, topupId: "topup-legacy" });
    const legacyEvent = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_legacy", order_id: "order_legacy", amount: 1099975, currency: "INR" },
        },
      },
    };
    const rawBody = JSON.stringify(legacyEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).toHaveBeenCalledTimes(1);
    expect(mocks.creditVerifiedUsageCreditsPayment).not.toHaveBeenCalled();
  });

  it("invoice.paid (above the ₹50,000 order limit) credits the invoice automatically", async () => {
    mocks.creditPaidInvoice.mockResolvedValueOnce({ ok: true, amountUsd: 600, productType: "ticket_balance" });
    const body = JSON.stringify({ event: "invoice.paid", payload: { invoice: { entity: { id: "inv_1" } } } });
    const response = await POST(requestFor(body, signatureFor(body)));
    expect(response.status).toBe(200);
    expect(mocks.creditPaidInvoice).toHaveBeenCalledWith("inv_1");
  });

  it("invoice.paid that couldn't be credited for a server reason asks Razorpay to retry", async () => {
    mocks.creditPaidInvoice.mockResolvedValueOnce({ ok: false, status: 502, reason: "Razorpay down" });
    const body = JSON.stringify({ event: "invoice.paid", payload: { invoice: { entity: { id: "inv_1" } } } });
    expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(500);
  });

  it("the payment.captured for an invoice payment is left to invoice.paid (never credited twice)", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_9", order_id: "order_9", invoice_id: "inv_1" } } } });
    const response = await POST(requestFor(body, signatureFor(body)));
    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
    expect(mocks.creditVerifiedUsageCreditsPayment).not.toHaveBeenCalled();
  });
  it("dispatches payment.captured with productType='mid_month_purchase' to the mid-month grant only", async () => {
    mocks.creditVerifiedMidMonthPayment.mockResolvedValue({ ok: true, pc: 1500 });
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_mm", order_id: "order_mm", notes: { productType: "mid_month_purchase", userId: "user-1" } } } },
    });
    const response = await POST(requestFor(body, signatureFor(body)));
    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedMidMonthPayment).toHaveBeenCalledWith({ orderId: "order_mm", paymentId: "pay_mm", signature: "", identity: { source: "orderNotes" } });
    expect(mocks.creditVerifiedUsageCreditsPayment).not.toHaveBeenCalled();
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("asks Razorpay to retry a mid-month grant that failed on our side", async () => {
    mocks.creditVerifiedMidMonthPayment.mockResolvedValue({ ok: false, status: 500, reason: "db down" });
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_mm", order_id: "order_mm", notes: { productType: "mid_month_purchase" } } } },
    });
    expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(500);
  });

  it("refund of a credits or mid-month purchase revokes that payment's usage bucket", async () => {
    mocks.rpc.mockResolvedValue({ data: { revoked: 1 }, error: null });
    for (const productType of ["usage_credits", "mid_month_purchase"]) {
      const body = JSON.stringify({ event: "refund.processed", payload: { payment: { entity: { id: `pay_${productType}`, notes: { productType } } } } });
      expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(200);
      expect(mocks.rpc).toHaveBeenLastCalledWith("revoke_usage_bucket_service", { p_payment_id: `pay_${productType}`, p_subscription_id: null, p_reason: "refund" });
    }
  });

  it("refund of a subscription payment revokes that subscription's current plan bucket", async () => {
    mocks.fetchRazorpayInvoice.mockResolvedValue({ id: "inv_s", subscription_id: "sub_77" });
    mocks.rpc.mockResolvedValue({ data: { revoked: 1 }, error: null });
    const body = JSON.stringify({ event: "refund.processed", payload: { payment: { entity: { id: "pay_sub", invoice_id: "inv_s" } } } });
    expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_usage_bucket_service", { p_payment_id: null, p_subscription_id: "sub_77", p_reason: "refund" });
  });

  it("refund of a Ticket Balance top-up is left as before (no automatic action)", async () => {
    const body = JSON.stringify({ event: "refund.processed", payload: { payment: { entity: { id: "pay_tb", notes: { productType: "ticket_balance" } } } } });
    expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a refund that could not be applied asks Razorpay to retry", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    const body = JSON.stringify({ event: "refund.processed", payload: { payment: { entity: { id: "pay_x", notes: { productType: "usage_credits" } } } } });
    expect((await POST(requestFor(body, signatureFor(body)))).status).toBe(500);
  });
});
