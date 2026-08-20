import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTicketBalanceOrderPayload,
  calculateTicketBalanceInrPayment,
  getTicketBalanceUsdInrRate,
  getTicketPricingConfig,
  MIN_TICKET_BALANCE_TOPUP_USD,
  MAX_TICKET_BALANCE_TOPUP_USD,
} from "./razorpay";

beforeEach(() => {
  delete process.env.TICKET_BALANCE_TOPUP_PRESETS;
  delete process.env.TICKET_BALANCE_MIN_TOPUP_USD;
  delete process.env.TICKET_BALANCE_MAX_TOPUP_USD;
  delete process.env.TICKET_BALANCE_USD_INR_RATE;
});

describe("getTicketPricingConfig", () => {
  it("falls back to code defaults when no env vars are set", () => {
    const config = getTicketPricingConfig();
    expect(config.minTopupUsd).toBe(MIN_TICKET_BALANCE_TOPUP_USD);
    expect(config.maxTopupUsd).toBe(MAX_TICKET_BALANCE_TOPUP_USD);
    expect(config.minTopupUsd).toBe(30);
    expect(config.maxTopupUsd).toBe(20000);
  });

  it("respects a real env override for the maximum", () => {
    process.env.TICKET_BALANCE_MAX_TOPUP_USD = "5000";
    expect(getTicketPricingConfig().maxTopupUsd).toBe(5000);
  });

  it("ignores an invalid (non-positive) max override and falls back to the default", () => {
    process.env.TICKET_BALANCE_MAX_TOPUP_USD = "-100";
    expect(getTicketPricingConfig().maxTopupUsd).toBe(MAX_TICKET_BALANCE_TOPUP_USD);
  });

  it("min and max are independently configurable", () => {
    process.env.TICKET_BALANCE_MIN_TOPUP_USD = "10";
    process.env.TICKET_BALANCE_MAX_TOPUP_USD = "50000";
    const config = getTicketPricingConfig();
    expect(config.minTopupUsd).toBe(10);
    expect(config.maxTopupUsd).toBe(50000);
  });
});

describe("ticket balance INR Razorpay conversion", () => {
  it("uses the configured 95.65 INR/USD default", () => {
    expect(getTicketBalanceUsdInrRate()).toBe(95.65);
  });

  it("$115 calculates to INR 10,999.75 / 1,099,975 paise", () => {
    expect(calculateTicketBalanceInrPayment(115)).toMatchObject({
      amountUsd: 115,
      usdCents: 11500,
      usdInrRate: 95.65,
      amountInr: 10999.75,
      amountPaise: 1099975,
    });
  });

  it("calculates arbitrary USD amounts dynamically", () => {
    expect(calculateTicketBalanceInrPayment(75)?.amountPaise).toBe(717375);
    expect(calculateTicketBalanceInrPayment(250)?.amountPaise).toBe(2391250);
    expect(calculateTicketBalanceInrPayment(5000)?.amountPaise).toBe(47825000);
  });

  it("builds Razorpay Orders in INR while keeping the ledger amount in USD notes", () => {
    const result = buildTicketBalanceOrderPayload({ amountUsd: 115, userId: "user-1", organizationId: "org-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.amount).toBe(1099975);
    expect(result.payload.currency).toBe("INR");
    expect(result.payload.notes.amountUsd).toBe("115.00");
    expect(result.payload.notes.amountInr).toBe("10999.75");
    expect(result.payload.notes.usdInrRate).toBe("95.65");
    expect(result.payload.notes.organizationId).toBe("org-1");
  });

  it("accepts $30 and $20,000, preserving the existing product ceiling", () => {
    expect(buildTicketBalanceOrderPayload({ amountUsd: 30, userId: "user-1" }).ok).toBe(true);
    const max = buildTicketBalanceOrderPayload({ amountUsd: 20000, userId: "user-1" });
    expect(max.ok).toBe(true);
    if (max.ok) expect(max.amountPaise).toBe(191300000);
  });

  it("rejects $29.99 and $20,000.01 server-side", () => {
    expect(buildTicketBalanceOrderPayload({ amountUsd: 29.99, userId: "user-1" })).toMatchObject({ ok: false });
    expect(buildTicketBalanceOrderPayload({ amountUsd: 20000.01, userId: "user-1" })).toMatchObject({ ok: false });
  });
});
