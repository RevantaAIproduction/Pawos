import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTicketBalanceOrderPayload,
  buildUsageCreditsOrderPayload,
  calculateTicketBalanceInrPayment,
  getTicketBalanceUsdInrRate,
  getTicketPricingConfig,
  getUsageCreditsPricingConfig,
  MIN_TICKET_BALANCE_TOPUP_USD,
  MAX_TICKET_BALANCE_TOPUP_USD,
  MIN_USAGE_CREDITS_TOPUP_USD,
  MAX_USAGE_CREDITS_TOPUP_USD,
} from "./razorpay";

beforeEach(() => {
  delete process.env.TICKET_BALANCE_TOPUP_PRESETS;
  delete process.env.TICKET_BALANCE_MIN_TOPUP_USD;
  delete process.env.TICKET_BALANCE_MAX_TOPUP_USD;
  delete process.env.TICKET_BALANCE_USD_INR_RATE;
  delete process.env.USAGE_CREDITS_TOPUP_PRESETS;
  delete process.env.USAGE_CREDITS_MIN_TOPUP_USD;
  delete process.env.USAGE_CREDITS_MAX_TOPUP_USD;
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

  it("stamps productType='ticket_balance' in order notes", () => {
    const result = buildTicketBalanceOrderPayload({ amountUsd: 30, userId: "user-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.notes.productType).toBe("ticket_balance");
  });
});

describe("Usage Credits order payload", () => {
  it("has $5 minimum and $20,000 maximum by default", () => {
    expect(MIN_USAGE_CREDITS_TOPUP_USD).toBe(5);
    expect(MAX_USAGE_CREDITS_TOPUP_USD).toBe(20000);
    const config = getUsageCreditsPricingConfig();
    expect(config.minTopupUsd).toBe(5);
    expect(config.maxTopupUsd).toBe(20000);
  });

  it("accepts $5 and rejects $4.99", () => {
    expect(buildUsageCreditsOrderPayload({ amountUsd: 5, userId: "user-1" }).ok).toBe(true);
    expect(buildUsageCreditsOrderPayload({ amountUsd: 4.99, userId: "user-1" })).toMatchObject({ ok: false });
  });

  it("accepts $20,000 and rejects $20,000.01", () => {
    expect(buildUsageCreditsOrderPayload({ amountUsd: 20000, userId: "user-1" }).ok).toBe(true);
    expect(buildUsageCreditsOrderPayload({ amountUsd: 20000.01, userId: "user-1" })).toMatchObject({ ok: false });
  });

  it("stamps productType='usage_credits' in order notes (never 'ticket_balance')", () => {
    const result = buildUsageCreditsOrderPayload({ amountUsd: 5, userId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.notes.productType).toBe("usage_credits");
    expect(result.payload.notes.productType).not.toBe("ticket_balance");
  });

  it("$5 → correct INR paise (478.25 INR = 47825 paise)", () => {
    const result = buildUsageCreditsOrderPayload({ amountUsd: 5, userId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.amount).toBe(47825);
    expect(result.payload.currency).toBe("INR");
    expect(result.payload.notes.amountUsd).toBe("5.00");
    expect(result.payload.notes.amountInr).toBe("478.25");
  });

  it("$30 → 2869.50 INR", () => {
    const result = buildUsageCreditsOrderPayload({ amountUsd: 30, userId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.notes.amountInr).toBe("2869.50");
  });

  it("$100 → 9565.00 INR", () => {
    const result = buildUsageCreditsOrderPayload({ amountUsd: 100, userId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.notes.amountInr).toBe("9565.00");
  });

  it("uses the same 95.65 INR/USD rate as ticket balance", () => {
    const ucResult = buildUsageCreditsOrderPayload({ amountUsd: 100, userId: "user-1" });
    const tbResult = buildTicketBalanceOrderPayload({ amountUsd: 100, userId: "user-1" });
    expect(ucResult.ok && tbResult.ok).toBe(true);
    if (!ucResult.ok || !tbResult.ok) return;
    expect(ucResult.amountPaise).toBe(tbResult.amountPaise);
  });

  it("minimum is strictly lower than autonomous work credits minimum", () => {
    expect(MIN_USAGE_CREDITS_TOPUP_USD).toBeLessThan(MIN_TICKET_BALANCE_TOPUP_USD);
  });

  it("env var overrides are respected", () => {
    process.env.USAGE_CREDITS_MIN_TOPUP_USD = "10";
    process.env.USAGE_CREDITS_MAX_TOPUP_USD = "500";
    const config = getUsageCreditsPricingConfig();
    expect(config.minTopupUsd).toBe(10);
    expect(config.maxTopupUsd).toBe(500);
  });
});
