import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "webhook_secret";

const mocks = vi.hoisted(() => ({
  creditVerifiedTicketBalancePayment: vi.fn(),
  creditVerifiedUsageCreditsPayment: vi.fn(),
  fetchRazorpaySubscription: vi.fn(),
  getRazorpayCredentials: vi.fn(() => ({ keyId: "rzp_key", keySecret: "rzp_secret" })),
  recordRazorpaySubscription: vi.fn(async () => "recorded"),
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
});
