import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  membership: vi.fn(),
  caseUpdate: vi.fn(),
  sendInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.membership }) }) }) }) }),
  }),
}));
vi.mock("@/lib/billing/razorpay", () => ({
  getRazorpayCredentials: () => ({ keyId: "k", keySecret: "s" }),
  razorpayAuthHeader: () => "Basic x",
  getTicketBalanceUsdInrRate: () => 95.65,
  getTicketPricingConfig: () => ({ topupPresetsUsd: [], minTopupUsd: 5, maxTopupUsd: 20000 }),
  getUsageCreditsPricingConfig: () => ({ topupPresetsUsd: [], minTopupUsd: 5, maxTopupUsd: 20000 }),
}));
vi.mock("@/lib/mail/invoiceMailer", () => ({ sendInvoiceEmail: mocks.sendInvoiceEmail }));
vi.mock("@/lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({ from: () => ({ update: (v: unknown) => ({ eq: () => ({ eq: async () => { mocks.caseUpdate(v); return { error: null }; } }) }) }) }),
}));

import { POST } from "./route";

const created: { notes: Record<string, string>; line_items: { amount: number }[] }[] = [];
const req = (body: unknown) => new Request("https://pawos.test/api/billing/create-high-value-invoice", { method: "POST", body: JSON.stringify(body) });
const base = { accessToken: "tok", billingEmail: "buyer@example.com", description: "Autonomous Work Credits", productType: "ticket_balance" };

describe("create-high-value-invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    created.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      created.push(JSON.parse(init.body));
      n += 1;
      return { ok: true, json: async () => ({ id: `inv_${n}`, short_url: `https://rzp.io/i/${n}` }) };
    }));
  });

  it("works for a personal buyer (no organization): invoices stamped with buyer, wallet and exact amount", async () => {
    const res = await POST(req({ ...base, amountUsd: 600, billingCaseId: "case-1" }));
    expect(res.status).toBe(200);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(created[0]!.line_items[0]!.amount).toBe(5_739_000); // $600 × ₹95.65
    expect(created[0]!.notes).toMatchObject({ productType: "ticket_balance", userId: "user-1", organizationId: "", amountUsd: "600.00", amountPaise: "5739000", billingCaseId: "case-1" });
    expect(mocks.caseUpdate).toHaveBeenCalledWith(expect.objectContaining({ invoice_ids: ["inv_1"], invoice_statuses: ["issued"] }));
  });

  it("splits above ₹5,00,000 into several invoices", async () => {
    await POST(req({ ...base, amountUsd: 12_000 }));
    expect(created).toHaveLength(3);
    expect(created.every((c) => c.line_items[0]!.amount <= 50_000_000)).toBe(true);
  });

  it("≤ ₹50,000 is refused — that is a normal one-time order", async () => {
    const res = await POST(req({ ...base, amountUsd: 500 })); // ₹47,825
    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("an organization purchase needs active membership", async () => {
    mocks.membership.mockResolvedValueOnce({ data: null });
    expect((await POST(req({ ...base, amountUsd: 600, organizationId: "org-1" }))).status).toBe(403);
    mocks.membership.mockResolvedValueOnce({ data: { id: "m" } });
    expect((await POST(req({ ...base, amountUsd: 600, organizationId: "org-1" }))).status).toBe(200);
    expect(created.at(-1)!.notes.organizationId).toBe("org-1");
  });

  it("refuses without a session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    expect((await POST(req({ ...base, amountUsd: 600 }))).status).toBe(401);
  });
});
