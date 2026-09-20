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
  amount: number;
  currency: string;
}
interface FakeOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  notes: Record<string, string>;
}

// 1. Mock aliases for the web codebase
vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/billing/razorpay", () => ({
  getRazorpayCredentials: vi.fn(),
  verifyRazorpayOrderPaymentSignature: vi.fn(),
  fetchRazorpayPayment: vi.fn(),
  fetchRazorpayOrder: vi.fn(),
  getUsageCreditsPricingConfig: vi.fn(),
  calculateTicketBalanceInrPayment: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/serviceClient";
import * as razorpayMock from "@/lib/billing/razorpay";
import { creditVerifiedUsageCreditsPayment } from "../../../pawos-web/src/lib/billing/usageCreditsCrediting";

function createFakeServiceClient() {
  const topups = new Map<string, string>();
  let counter = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name !== "add_usage_credits_service") return { data: null, error: { message: "unknown rpc" } };
    const paymentId = args.p_razorpay_payment_id as string | null;
    const amountUsd = args.p_amount_usd as number;
    if (!paymentId) return { data: null, error: { message: "requires a real razorpay_payment_id" } };
    if (amountUsd < 5) return { data: null, error: { message: "Minimum top-up is $5" } };
    if (amountUsd > 20000) return { data: null, error: { message: "Maximum top-up is $20,000" } };
    const existing = topups.get(paymentId);
    if (existing) return { data: existing, error: null };
    
    // Model concurrent execution race conditions and Postgres unique constraints.
    // A slight delay guarantees multiple concurrent promises all read 'undefined' above.
    await new Promise(r => setTimeout(r, 10));
    
    if (topups.has(paymentId)) {
      // In production, the RPC uses ON CONFLICT DO NOTHING and returns the existing row.
      return { data: topups.get(paymentId), error: null };
    }
    
    const id = `topup-${++counter}`;
    topups.set(paymentId, id);
    return { data: id, error: null };
  });
  return { client: { rpc }, rpc, topups };
}

const ORDER_ID = "order_real_123";
const PAYMENT_ID = "pay_real_456";
const USER_ID = "user-uuid-abc";

function baseOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: ORDER_ID,
    amount: 95650, // e.g. $10 * 95.65 * 100
    currency: "INR",
    status: "paid",
    notes: { productType: "usage_credits", amountUsd: "10.00", usdInrRate: "95.65", amountInr: "956.50", amountPaise: "95650", currency: "INR", organizationId: "", userId: USER_ID },
    ...overrides,
  };
}

function basePayment(overrides: Partial<FakePayment> = {}): FakePayment {
  return {
    id: PAYMENT_ID,
    order_id: ORDER_ID,
    status: "captured",
    amount: 95650,
    currency: "INR",
    ...overrides,
  };
}

let fakeService: ReturnType<typeof createFakeServiceClient>;
let mockPayments: Record<string, FakePayment> = {};
let mockOrders: Record<string, FakeOrder> = {};

beforeEach(() => {
  mockPayments = {};
  mockOrders = {};
  fakeService = createFakeServiceClient();
  
  vi.mocked(createServiceClient).mockReturnValue(fakeService.client as any);
  vi.mocked(razorpayMock.getRazorpayCredentials).mockReturnValue({ keyId: KEY_ID, keySecret: KEY_SECRET });
  
  vi.mocked(razorpayMock.verifyRazorpayOrderPaymentSignature).mockImplementation((oid, pid, sig, sec) => {
    return sig === realSignature(oid, pid) && sec === KEY_SECRET;
  });
  
  vi.mocked(razorpayMock.fetchRazorpayPayment).mockImplementation(async (pid) => mockPayments[pid] || null);
  vi.mocked(razorpayMock.fetchRazorpayOrder).mockImplementation(async (oid) => mockOrders[oid] || null);
  
  vi.mocked(razorpayMock.getUsageCreditsPricingConfig).mockReturnValue({ topupPresetsUsd: [5, 10], minTopupUsd: 5, maxTopupUsd: 20000 });
  vi.mocked(razorpayMock.calculateTicketBalanceInrPayment).mockImplementation((usd) => {
    return { amountUsd: usd, usdInrRate: 95.65, amountInr: usd * 95.65, amountPaise: Math.round(usd * 95.65 * 100), payload: {} as any };
  });
});

describe("Usage Credits Crediting Security & Invariants", () => {
  it("A. Valid captured Usage Credits payment", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder();
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(true);
    expect(result.amountUsd).toBe(10);
    expect(fakeService.rpc).toHaveBeenCalledWith("add_usage_credits_service", {
      p_user_id: USER_ID,
      p_organization_id: null,
      p_amount_usd: 10,
      p_razorpay_payment_id: PAYMENT_ID,
    });
  });

  it("B. Invalid signature", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder();
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: "wrong-signature",
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid payment signature/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("C. Payment not captured", async () => {
    mockPayments[PAYMENT_ID] = basePayment({ status: "authorized" });
    mockOrders[ORDER_ID] = baseOrder();
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not captured/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("D. Wrong product type", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder({ notes: { ...baseOrder().notes, productType: "ticket_balance" } });
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/product type does not match usage_credits/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("E. Client amount tampering", async () => {
    mockPayments[PAYMENT_ID] = basePayment({ amount: 95650 }); // $10 real payment
    mockOrders[ORDER_ID] = baseOrder({ amount: 95650, notes: { ...baseOrder().notes, amountUsd: "100.00" } });
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Payment amount does not match the server-calculated INR amount/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("F. Client user tampering", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder();
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: "attacker_id" },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not belong to your account/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("G. Payment ID idempotency", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder();
    
    const req = {
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken" as const, userId: USER_ID },
    };
    
    const [r1, r2] = await Promise.all([
      creditVerifiedUsageCreditsPayment(req),
      creditVerifiedUsageCreditsPayment(req),
    ]);
    
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // @ts-ignore
    expect(r1.topupId).toBe(r2.topupId);
    expect(fakeService.topups.size).toBe(1);
    expect(fakeService.rpc).toHaveBeenCalledTimes(2);
  });

  it("H. Invalid/missing order/payment metadata", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder({ notes: { productType: "usage_credits", userId: USER_ID } as any });
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missing the server-recorded USD amount/i);
    expect(fakeService.rpc).not.toHaveBeenCalled();
  });

  it("I. Service-role RPC boundary", async () => {
    mockPayments[PAYMENT_ID] = basePayment();
    mockOrders[ORDER_ID] = baseOrder();
    
    const result = await creditVerifiedUsageCreditsPayment({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: realSignature(ORDER_ID, PAYMENT_ID),
      identity: { source: "callerToken", userId: USER_ID },
    });
    
    expect(result.ok).toBe(true);
    expect(createServiceClient).toHaveBeenCalled();
    expect(fakeService.rpc).toHaveBeenCalledWith("add_usage_credits_service", expect.anything());
  });
});
