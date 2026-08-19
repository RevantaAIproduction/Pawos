import { describe, it, expect, beforeEach } from "vitest";
import { getTicketPricingConfig, MIN_TICKET_BALANCE_TOPUP_USD, MAX_TICKET_BALANCE_TOPUP_USD } from "./razorpay";

beforeEach(() => {
  delete process.env.TICKET_BALANCE_TOPUP_PRESETS;
  delete process.env.TICKET_BALANCE_MIN_TOPUP_USD;
  delete process.env.TICKET_BALANCE_MAX_TOPUP_USD;
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
