import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: "topup-1", error: null })),
  caseRow: { invoice_ids: ["inv_1", "inv_2"], invoice_statuses: ["issued", "issued"] } as Record<string, unknown> | null,
  caseUpdate: vi.fn(),
}));

vi.mock("@/lib/billing/razorpay", () => ({
  getRazorpayCredentials: () => ({ keyId: "k", keySecret: "s" }),
  razorpayAuthHeader: () => "Basic x",
}));
vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.caseRow }) }) }),
      update: (values: unknown) => ({ eq: async () => { mocks.caseUpdate(values); return { error: null }; } }),
    }),
  }),
}));

import { creditPaidInvoice, splitInvoiceShares } from "./invoiceCrediting";

const invoice = (over: Record<string, unknown> = {}, notes: Record<string, string> = {}) => ({
  id: "inv_1",
  status: "paid",
  amount: 5_738_550,
  amount_paid: 5_738_550,
  currency: "INR",
  payment_id: "pay_1",
  notes: { productType: "ticket_balance", userId: "user-1", organizationId: "", amountUsd: "600.00", amountPaise: "5738550", billingCaseId: "case-1", ...notes },
  ...over,
});
const serveInvoice = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })));

describe("Splitting a high-value purchase into invoices (≤ ₹5,00,000 each)", () => {
  it("one invoice up to ₹5 lakh; exact dollars across several above it", () => {
    expect(splitInvoiceShares(600, 95.65)).toEqual([{ amountUsd: 600, amountPaise: 5_739_000 }]);
    const shares = splitInvoiceShares(12_000, 95.65); // ₹11,47,800 → 3 invoices
    expect(shares).toHaveLength(3);
    expect(shares.every((s) => s.amountPaise <= 500_000 * 100)).toBe(true);
    expect(shares.reduce((sum, s) => sum + s.amountUsd * 100, 0)).toBe(1_200_000);
  });
});

describe("Crediting a paid invoice automatically", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.caseRow = { invoice_ids: ["inv_1", "inv_2"], invoice_statuses: ["issued", "issued"] };
  });

  it("personal Ticket Wallet invoice → credits the buyer once, keyed on the payment id", async () => {
    serveInvoice(invoice());
    expect(await creditPaidInvoice("inv_1")).toEqual({ ok: true, amountUsd: 600, productType: "ticket_balance" });
    expect(mocks.rpc).toHaveBeenCalledWith("add_ticket_balance_service", {
      p_user_id: "user-1", p_organization_id: null, p_amount_usd: 600, p_razorpay_payment_id: "pay_1",
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ invoice_statuses: ["paid", "issued"] }));
    expect(mocks.caseUpdate.mock.calls[0]![0]).not.toHaveProperty("payment_status"); // one of two still open
  });

  it("organization usage-credits invoice → usage credits for the organization; case received when all paid", async () => {
    mocks.caseRow = { invoice_ids: ["inv_1"], invoice_statuses: ["issued"] };
    serveInvoice(invoice({}, { productType: "usage_credits", organizationId: "org-9" }));
    expect((await creditPaidInvoice("inv_1")).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("add_usage_credits_service", expect.objectContaining({ p_user_id: null, p_organization_id: "org-9" }));
    expect(mocks.caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ payment_status: "received" }));
  });

  it.each([
    ["not paid yet", invoice({ status: "issued" })],
    ["partly paid", invoice({ amount_paid: 100 })],
    ["amount changed from what PawOS issued", invoice({ amount: 100, amount_paid: 100 })],
    ["not a PawOS checkout invoice", invoice({ notes: { amountUsd: "600.00" } })],
    ["another currency", invoice({ currency: "USD" })],
  ])("never credits when %s", async (_label, body) => {
    serveInvoice(body);
    const result = await creditPaidInvoice("inv_1");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("Razorpay unreachable → retry later (5xx), nothing credited", async () => {
    serveInvoice(null, false);
    expect((await creditPaidInvoice("inv_1")).status).toBe(502);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
