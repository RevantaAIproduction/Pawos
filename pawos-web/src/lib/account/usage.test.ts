import { describe, expect, it } from "vitest";
import type { AccountContext } from "./accountContext";
import { getUsageOverview } from "./usage";

/**
 * What PawOS Web shows for usage is what get_my_usage_summary returned: the percentage on the bar and
 * the Paw Compute shown as used are decided in the database (the amount follows the bar — a Pro plan
 * at 97% is 1,940 of 2,000 PC, $19.40 of $20). Nothing here recomputes them, and nothing private —
 * the provider-cost allowance, what was really spent — is in the summary to pass on.
 */
const account = (summary: unknown, error: unknown = null) => ({ supabase: { rpc: async (name: string) => (name === "get_my_usage_summary" ? { data: summary, error } : { data: null, error: null }) } }) as unknown as AccountContext;

const bucket = (extra: Record<string, unknown>) => ({ id: "b", type: "monthly_plan", label: "Pro plan", productKey: "pro_monthly", amountPaidCents: 2000, amountUsedCents: 0, pcTotal: 2000, pcUsed: 0, pcRemaining: 2000, percentUsed: 0, status: "active", startsAt: null, expiresAt: null, resetsAt: "2026-10-29T00:00:00Z", ...extra });
const summary = (buckets: unknown[]) => ({ plan: { productKey: "pro_monthly", label: "Pro plan" }, bucketFunded: true, buckets, weeklyPacing: { percentUsed: 40, reached: false, resetsAt: null, pcLimit: 1000 }, creditsPcRemaining: 20, limitReached: false, limitReason: null, limitResetsAt: null });

describe("usage shown on PawOS Web", () => {
  it.each([
    ["Pro at 90%", { pcUsed: 1800, percentUsed: 90 }],
    ["Pro at 97% ($19.40 of $20)", { pcUsed: 1940, percentUsed: 97 }],
    ["Pro at 100% ($20 of $20)", { pcUsed: 2000, percentUsed: 100 }],
    ["Pro Max 5x at 97%", { pcTotal: 10000, pcUsed: 9700, percentUsed: 97 }],
    ["Pro Max 20x at 100%", { pcTotal: 25000, pcUsed: 25000, percentUsed: 100 }],
    ["a $15 mid-month purchase at 97%", { type: "mid_month_purchase", pcTotal: 1500, pcUsed: 1455, percentUsed: 97 }],
    ["$10 of credits at 90%", { type: "purchased_credits", pcTotal: 1000, pcUsed: 900, percentUsed: 90 }],
  ])("%s is passed on exactly as the server gave it", async (_name, values) => {
    const overview = await getUsageOverview(account(summary([bucket(values)])));
    const sent = bucket(values);
    expect(overview?.buckets[0]).toMatchObject({ pcTotal: sent.pcTotal, pcUsed: sent.pcUsed, percentUsed: sent.percentUsed, type: sent.type });
  });

  it("the percentage is never worked out here: a bar and an amount that disagree are both passed on untouched", async () => {
    const overview = await getUsageOverview(account(summary([bucket({ pcUsed: 500, percentUsed: 97 })])));
    expect(overview?.buckets[0]).toMatchObject({ pcUsed: 500, percentUsed: 97 });
  });

  it("a percentage outside 0–100 is held to the range; one that isn't a number is 0", async () => {
    const overview = await getUsageOverview(account(summary([bucket({ percentUsed: 250 }), bucket({ id: "c", percentUsed: -5 }), bucket({ id: "d", percentUsed: "97" })])));
    expect(overview?.buckets.map((entry) => entry.percentUsed)).toEqual([100, 0, 0]);
  });

  it("nothing private reaches the page, even if the summary were ever to carry it", async () => {
    const overview = await getUsageOverview(account(summary([bucket({ pcUsed: 1940, percentUsed: 97, privateAllowanceMicroUsd: 10000000, consumedMicroUsd: 9500000, reservedMicroUsd: 1200 })])));
    expect(JSON.stringify(overview)).not.toMatch(/micro|private|allowance|10000000|9500000/i);
  });

  it("when usage can't be read the page is told so, rather than shown zeros", async () => {
    expect(await getUsageOverview(account(null, { message: "down" }))).toBeNull();
  });
});
