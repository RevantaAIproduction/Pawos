import { describe, it, expect, vi } from "vitest";
import { normalizedComputeToCustomerPc, customerPurchaseUsdToPurchasedPc, customerPcToPurchaseUsd } from "../../shared/billing/CustomerPcCommercialModel";
import { creditStore } from "../../main/billing/CreditStore";

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

describe("Fable & Usage Credits Accounting", () => {
  it("FABLE-002 to FABLE-005, FABLE-010: Fable stops at $0 and consumes Purchased Usage Credits without Tier Limits", () => {
    creditStore.reset();
    creditStore.state.userId = "user123";
    
    // FABLE-005: blocks at $0
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(0);

    // FABLE-006: purchase $10
    creditStore.setPurchasedUsageCreditsUsd(10);
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(10);
    
    // purchase another $10
    creditStore.setPurchasedUsageCreditsUsd(20);
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(20);

    // Consume $9 via Fable (isFable=true)
    creditStore.consume(900, "test", undefined, true, false);
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(11);
    
    // Consume $11
    creditStore.consume(1100, "test", undefined, true, false);
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(0);
    
    // FABLE-010: cannot produce negative balance
    creditStore.consume(100, "test", undefined, true, false);
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(0);
  });
  
  it("FABLE-011: Outbox tracking for failed remote deduction", () => {
    creditStore.reset();
    creditStore.state.userId = "user123";
    creditStore.setPurchasedUsageCreditsUsd(10);
    
    // Simulate generation with outbox id
    const outboxId = "test-uuid";
    creditStore.consume(100, "test", undefined, true, false, outboxId);
    
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(9);
    expect(creditStore.getPendingDeductions().length).toBe(1);
    expect(creditStore.getPendingDeductions()[0].amountUsd).toBe(1);
    
    // On sync, the pending deduction should be preserved if not resolved
    creditStore.setPurchasedUsageCreditsUsd(10); // Remote says 10 (deduction failed previously)
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(9); // Correctly overrides to 9 locally
    
    // If resolved
    creditStore.resolvePendingDeduction(outboxId);
    creditStore.setPurchasedUsageCreditsUsd(9); // Remote says 9 (deduction succeeded)
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(9);
    expect(creditStore.getPendingDeductions().length).toBe(0);
  });
  
  it("FABLE-013: Account A credits never appear in Account B", () => {
    creditStore.reset();
    creditStore.state.userId = "userA";
    creditStore.setPurchasedUsageCreditsUsd(50);
    
    // logout
    creditStore.reset();
    
    // login B
    creditStore.state.userId = "userB";
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(0);
  });
});
