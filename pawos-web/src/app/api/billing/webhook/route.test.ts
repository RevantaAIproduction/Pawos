import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "webhook_secret";

const mocks = vi.hoisted(() => ({
  creditVerifiedTicketBalancePayment: vi.fn(),
}));

vi.mock("@/lib/billing/ticketBalanceCrediting", () => ({
  creditVerifiedTicketBalancePayment: mocks.creditVerifiedTicketBalancePayment,
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

  it("accepts subscription events without invoking one-time crediting", async () => {
    const subscriptionEvent = {
      event: "subscription.activated",
      payload: { subscription: { entity: { id: "sub_123" } } },
    };
    const rawBody = JSON.stringify(subscriptionEvent);

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(200);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON after signature verification", async () => {
    const rawBody = "{not json";

    const response = await POST(requestFor(rawBody, signatureFor(rawBody)));

    expect(response.status).toBe(400);
    expect(mocks.creditVerifiedTicketBalancePayment).not.toHaveBeenCalled();
  });
});
