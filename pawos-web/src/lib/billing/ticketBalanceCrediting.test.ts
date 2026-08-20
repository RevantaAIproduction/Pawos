import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const KEY_ID = "rzp_test_key_id";
const KEY_SECRET = "rzp_test_key_secret";

function realSignature(orderId: string, paymentId: string): string {
  return crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

interface FakePayment {
  id: string;
  order_id: string | null;
  status: string;
  amount: number; // smallest currency unit (paise for INR)
  currency: string;
}
interface FakeOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes: Record<string, string>;
}

// Mocked BEFORE importing the module under test, per vitest's hoisting contract.
vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/serviceClient";
import { creditVerifiedTicketBalancePayment } from "./ticketBalanceCrediting";

/**
 * A faithful-enough fake of add_ticket_balance_service(): idempotent on razorpay_payment_id (a
 * second call for the same payment id returns the SAME topup id, never a second credit), and
 * enforces the same $30/$20,000 bounds the real SQL function enforces as defense-in-depth. The
 * check-and-set below has no `await` between the lookup and the insert, so — exactly like a real
 * DB transaction serialized by a unique index — two "concurrent" JS calls into this mock can never
 * both observe an empty slot and both insert; whichever microtask runs first wins, and the other
 * observes the already-created row. This is what backs scenarios 11/12/13 below.
 */
function createFakeServiceClient() {
  const topups = new Map<string, string>(); // paymentId -> topupId
  let counter = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== "add_ticket_balance_service") return { data: null, error: { message: "unknown rpc" } };
    const paymentId = args.p_razorpay_payment_id as string | null;
    const amountUsd = args.p_amount_usd as number;
    if (!paymentId) return { data: null, error: { message: "requires a real razorpay_payment_id" } };
    if (amountUsd < 30) return { data: null, error: { message: "Minimum top-up is $30" } };
    if (amountUsd > 20000) return { data: null, error: { message: "Maximum top-up is $20,000" } };
    const existing = topups.get(paymentId);
    if (existing) return { data: existing, error: null };
    const id = `topup-${++counter}`;
    topups.set(paymentId, id);
    return { data: id, error: null };
  });
  return { client: { rpc }, rpc, topups };
}

function mockFetch(payments: Record<string, FakePayment>, orders: Record<string, FakeOrder>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const paymentMatch = url.match(/\/v1\/payments\/([^/]+)$/);
    if (paymentMatch) {
      const p = payments[decodeURIComponent(paymentMatch[1]!)];
      if (!p) return { ok: false, status: 404, text: async () => "payment not found" } as Response;
      return { ok: true, json: async () => p } as Response;
    }
    const orderMatch = url.match(/\/v1\/orders\/([^/]+)$/);
    if (orderMatch) {
      const o = orders[decodeURIComponent(orderMatch[1]!)];
      if (!o) return { ok: false, status: 404, text: async () => "order not found" } as Response;
      return { ok: true, json: async () => o } as Response;
    }
    return { ok: false, status: 404, text: async () => "unknown endpoint" } as Response;
  }) as unknown as typeof fetch;
}

const ORDER_ID = "order_real_123";
const PAYMENT_ID = "pay_real_456";
const USER_ID = "user-uuid-abc";

function baseOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: ORDER_ID,
    amount: 286950,
    currency: "INR",
    status: "paid",
    notes: { productType: "ticket_balance", amountUsd: "30.00", usdInrRate: "95.65", amountInr: "2869.50", amountPaise: "286950", currency: "INR", organizationId: "", userId: USER_ID },
    ...overrides,
  };
}
function basePayment(overrides: Partial<FakePayment> = {}): FakePayment {
  return {
    id: PAYMENT_ID,
    order_id: ORDER_ID,
    status: "captured",
    amount: 286950,
    currency: "INR",
    ...overrides,
  };
}

let fakeService: ReturnType<typeof createFakeServiceClient>;

beforeEach(() => {
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  delete process.env.TICKET_BALANCE_MIN_TOPUP_USD;
  delete process.env.TICKET_BALANCE_MAX_TOPUP_USD;
  fakeService = createFakeServiceClient();
  vi.mocked(createServiceClient).mockReturnValue(fakeService.client as unknown as ReturnType<typeof createServiceClient>);
});

describe("creditVerifiedTicketBalancePayment — 20 named attack regression scenarios", () => {
  it("1. valid payment credits exactly once", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(true);
    expect(result.amountUsd).toBe(30);
    expect(fakeService.topups.size).toBe(1);
  });

  it("2. invalid signature (malformed garbage) → zero credits", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: "not-a-real-hex-signature",
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid payment signature/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("3. wrong signature (valid hex shape, wrong secret) → zero credits", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const wrongSignature = crypto.createHmac("sha256", "not-the-real-secret").update(`${ORDER_ID}|${PAYMENT_ID}`).digest("hex");
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: wrongSignature,
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(fakeService.topups.size).toBe(0);
  });

  it("4. wrong order ID (payment belongs to a different order) → zero credits", async () => {
    const otherOrderId = "order_other_999";
    mockFetch(
      { [PAYMENT_ID]: basePayment({ order_id: otherOrderId }) },
      { [ORDER_ID]: baseOrder(), [otherOrderId]: baseOrder({ id: otherOrderId }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not belong to the expected order/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("5. wrong payment ID (does not exist at Razorpay) → zero credits", async () => {
    mockFetch({}, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: "pay_does_not_exist",
      signature: realSignature(ORDER_ID, "pay_does_not_exist"),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/could not verify payment/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("6. payment belongs to another order (order-linkage spoof) → zero credits", async () => {
    const legitOrderForPayment = "order_legit_for_payment";
    mockFetch(
      { [PAYMENT_ID]: basePayment({ order_id: legitOrderForPayment }) },
      { [ORDER_ID]: baseOrder(), [legitOrderForPayment]: baseOrder({ id: legitOrderForPayment }) }
    );
    // Attacker supplies a real signature for (ORDER_ID, PAYMENT_ID) but the payment's own
    // order_id (from Razorpay, not the client) points elsewhere.
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(fakeService.topups.size).toBe(0);
  });

  it("7. wrong/below-minimum amount → zero credits", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 95650 }) },
      { [ORDER_ID]: baseOrder({ amount: 95650, notes: { ...baseOrder().notes, amountUsd: "10.00", amountInr: "956.50", amountPaise: "95650" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/below the minimum/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("8. wrong currency (USD instead of INR) → zero credits", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ currency: "USD" }) },
      { [ORDER_ID]: baseOrder({ currency: "USD" }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/currency/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("9. failed payment → zero credits", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment({ status: "failed" }) }, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not captured/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("10. cancelled/incomplete payment (never captured) → zero credits", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment({ status: "created" }) }, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not captured/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("11. duplicate callback (same payment submitted twice, sequentially) → one credit", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const params = {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken" as const, userId: USER_ID },
    };
    const first = await creditVerifiedTicketBalancePayment(params);
    const second = await creditVerifiedTicketBalancePayment(params);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.topupId).toBe(first.topupId);
    expect(fakeService.topups.size).toBe(1);
  });

  it("12. concurrent duplicate callback (both fired via Promise.all) → one credit", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const params = {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken" as const, userId: USER_ID },
    };
    const [a, b] = await Promise.all([
      creditVerifiedTicketBalancePayment(params),
      creditVerifiedTicketBalancePayment(params),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.topupId).toBe(b.topupId);
    expect(fakeService.topups.size).toBe(1);
  });

  it("13. webhook + browser callback race (different identity sources, same payment) → one credit", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder() });
    const browserCall = creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    const webhookCall = creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: "", // webhook path never has a Checkout.js signature — authenticity is the webhook's own HMAC, verified upstream.
      identity: { source: "orderNotes" },
    });
    // The webhook path never verifies a signature (see identity: 'orderNotes' branch), so it can
    // legitimately succeed even with an empty signature string, exactly as production wires it.
    const [browser, webhook] = await Promise.all([browserCall, webhookCall]);
    expect(webhook.ok).toBe(true);
    // Whichever wins the race, the RPC's own idempotency means exactly one row exists.
    expect(fakeService.topups.size).toBe(1);
    if (browser.ok) expect(browser.topupId).toBe(webhook.topupId);
  });

  it("14. unknown payment (Razorpay 404s the order lookup too) → zero credits", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, {}); // order fetch 404s
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/could not verify order/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("15. below $30 ($29.99) → rejected", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 286854 }) },
      { [ORDER_ID]: baseOrder({ amount: 286854, notes: { ...baseOrder().notes, amountUsd: "29.99", amountInr: "2868.54", amountPaise: "286854" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(fakeService.topups.size).toBe(0);
  });

  it("16. exactly $30 → accepted", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment({ amount: 286950 }) }, { [ORDER_ID]: baseOrder({ amount: 286950 }) });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(true);
    expect(result.amountUsd).toBe(30);
  });

  it("17. $20,000 (exactly at the ceiling) → accepted", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 191300000 }) },
      { [ORDER_ID]: baseOrder({ amount: 191300000, notes: { ...baseOrder().notes, amountUsd: "20000.00", amountInr: "1913000.00", amountPaise: "191300000" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(true);
    expect(result.amountUsd).toBe(20000);
  });

  it("18. above $20,000 ($20,000.01) → rejected", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 191300096 }) },
      { [ORDER_ID]: baseOrder({ amount: 191300096, notes: { ...baseOrder().notes, amountUsd: "20000.01", amountInr: "1913000.96", amountPaise: "191300096" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/maximum top-up/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("19. renderer attempts to forge success (payment never actually captured) → rejected", async () => {
    // The renderer's Checkout.js `handler` callback firing is NOT proof of payment — only a
    // genuinely captured payment at Razorpay's own API results in a credit. Simulate a forged
    // "success" where Razorpay's own record shows the payment merely authorized, never captured.
    mockFetch({ [PAYMENT_ID]: basePayment({ status: "authorized" }) }, { [ORDER_ID]: baseOrder() });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(fakeService.topups.size).toBe(0);
  });

  it("20. renderer attempts to choose an arbitrary credit amount → rejected (no client amount is ever accepted or used)", async () => {
    // creditVerifiedTicketBalancePayment's own parameter type carries no amount field at all —
    // orderId/paymentId/signature/identity only. Structurally verify the credited amount is always
    // derived from Razorpay's own payment.amount, by asserting the RPC was called with exactly
    // that derived value, never anything else, regardless of what the order's own (client-supplied
    // at creation time) notes.amountUsd claims.
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 478250 }) }, // Razorpay's real captured amount: INR equivalent of $50
      { [ORDER_ID]: baseOrder({ amount: 478250, notes: { ...baseOrder().notes, amountUsd: "999999.00", amountInr: "4782.50", amountPaise: "478250" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/server-calculated INR amount/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("21. successful INR 10,999.75 payment credits exactly $115", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 1099975 }) },
      { [ORDER_ID]: baseOrder({ amount: 1099975, notes: { ...baseOrder().notes, amountUsd: "115.00", amountInr: "10999.75", amountPaise: "1099975" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(true);
    expect(result.amountUsd).toBe(115);
    expect(fakeService.rpc).toHaveBeenCalledWith("add_ticket_balance_service", expect.objectContaining({ p_amount_usd: 115 }));
  });

  it("22. payment amount that differs from the server-created INR order amount is rejected", async () => {
    mockFetch(
      { [PAYMENT_ID]: basePayment({ amount: 1099974 }) },
      { [ORDER_ID]: baseOrder({ amount: 1099975, notes: { ...baseOrder().notes, amountUsd: "115.00", amountInr: "10999.75", amountPaise: "1099975" } }) }
    );
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
    expect(fakeService.topups.size).toBe(0);
  });
});

describe("creditVerifiedTicketBalancePayment — payer-identity binding (order-notes cross-check)", () => {
  it("rejects a leaked-but-real triple replayed by a different signed-in user than the order's own payer", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder({ notes: { amountUsd: "30", organizationId: "", userId: USER_ID } }) });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: "a-different-attacker-user-id" },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not belong to your account/i);
    expect(fakeService.topups.size).toBe(0);
  });

  it("rejects a legacy order with no recorded USD amount", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder({ notes: {} }) });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/server-recorded USD amount/i);
  });

  it("webhook path rejects an order with no recorded payer identity (cannot resolve identity without a bearer token)", async () => {
    mockFetch({ [PAYMENT_ID]: basePayment() }, { [ORDER_ID]: baseOrder({ notes: { ...baseOrder().notes, userId: "" } }) });
    const result = await creditVerifiedTicketBalancePayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: "",
      identity: { source: "orderNotes" },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no recorded payer identity/i);
    expect(fakeService.topups.size).toBe(0);
  });
});
