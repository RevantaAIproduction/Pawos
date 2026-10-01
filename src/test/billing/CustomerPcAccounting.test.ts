import { describe, it, expect, vi } from "vitest";
import { normalizedComputeToCustomerPc, customerPurchaseUsdToPurchasedPc, customerPcToPurchaseUsd } from "../../shared/billing/CustomerPcCommercialModel";
import { creditStore } from "../../main/billing/CreditStore";
import { entitlementService } from "../../main/billing/EntitlementService";
import { subscriptionStore } from "../../main/billing/SubscriptionStore";
import { usageBucketClient, UsageBucketClient } from "../../main/billing/UsageBucketClient";

describe("Customer PC Accounting", () => {
  it("NORMAL-001: $1 provider cost -> 1000 NC -> 300 Customer PC ($3 of value, 3x markup)", () => {
    expect(normalizedComputeToCustomerPc(1000)).toBe(300);
  });
  it("NORMAL-002: $0.10 provider cost -> 100 NC -> 30 Customer PC", () => {
    expect(normalizedComputeToCustomerPc(100)).toBe(30);
  });
  it("NORMAL-003: $0.01 provider cost -> 10 NC -> 3 Customer PC", () => {
    expect(normalizedComputeToCustomerPc(10)).toBe(3);
  });
  it("FABLE-001: $1 customer purchase -> 100 Purchased PC", () => {
    expect(customerPurchaseUsdToPurchasedPc(1.00)).toBe(100);
    expect(customerPurchaseUsdToPurchasedPc(10.00)).toBe(1000);
  });
});

describe("Fable & purchased credits (server usage buckets)", () => {
  const summary = (creditsPc: number) => ({
    plan: null, bucketFunded: false, buckets: [], weeklyPacing: null, creditsPcRemaining: creditsPc,
    limitReached: creditsPc <= 0, limitReason: creditsPc <= 0 ? ("no_allowance" as const) : null, limitResetsAt: null,
  });

  it("FABLE-005: Fable is available only while purchased credits remain (from the server summary)", () => {
    vi.spyOn(subscriptionStore, "get").mockReturnValue({ tier: "pro", status: "active" });
    vi.spyOn(usageBucketClient, "getCachedSummary").mockReturnValue(summary(0));
    expect(entitlementService.checkGeneration("paw-fable").allowed).toBe(false);
    vi.spyOn(usageBucketClient, "getCachedSummary").mockReturnValue(summary(1000));
    expect(entitlementService.checkGeneration("paw-fable").allowed).toBe(true);
    expect(entitlementService.getPurchasedCreditsRemaining()).toBe(1000);
    vi.restoreAllMocks();
  });

  it("FABLE-010: local history never holds or reduces a purchased balance", () => {
    creditStore.reset();
    creditStore.setUser("user123");
    creditStore.consume(900, "test");
    expect("purchasedUsageCreditsUsd" in creditStore.getBalance()).toBe(false);
  });

  it("FABLE-013: signing out clears the cached summary — account A credits never appear for account B", () => {
    const client = new UsageBucketClient(async () => ({ ...summary(5000), buckets: [] }) as never);
    return client.refreshSummary().then(() => {
      expect(client.getCachedSummary()?.creditsPcRemaining).toBe(5000);
      client.clear();
      expect(client.getCachedSummary()).toBeNull();
    });
  });
});
