import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRazorpayPlanId, resolveTierFromRazorpayPlanId } from "./razorpay";

const ALL_NAMES = [
  "RAZORPAY_PLAN_ID_PRO", "RAZORPAY_PRO_ID", "RAZORPAY_PRO_MONTHLY_ID",
  "RAZORPAY_PLAN_ID_PRO_YEARLY", "RAZORPAY_PRO_YEARLY_ID", "Razorpay_Pro_Yearly_ID",
  "RAZORPAY_PLAN_ID_PROMAX_5X", "RAZORPAY_PRO_MAX_5X_ID", "RAZORPAY_PRO_MAX_ID", "RAZORPAY_PLAN_ID_PROMAX",
  "RAZORPAY_PLAN_ID_PROMAX_20X", "RAZORPAY_PRO_MAX_20X_ID",
  "RAZORPAY_PLAN_ID_TEAM_STANDARD", "RAZORPAY_TEAM_STANDARD_ID", "RAZORPAY_PLAN_ID_TEAM_PREMIUM", "RAZORPAY_TEAM_PREMIUM_ID",
];

describe("Razorpay plan ids — both env naming styles", () => {
  beforeEach(() => {
    for (const name of ALL_NAMES) vi.stubEnv(name, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads the names the live PawOS environment uses (RAZORPAY_PRO_ID, Razorpay_Pro_Yearly_ID, …)", () => {
    vi.stubEnv("RAZORPAY_PRO_ID", "plan_live_pro");
    vi.stubEnv("Razorpay_Pro_Yearly_ID", '"plan_live_pro_yearly"'); // quoted values are trimmed
    vi.stubEnv("RAZORPAY_PRO_MAX_ID", "plan_live_pm5");
    vi.stubEnv("RAZORPAY_PRO_MAX_20X_ID", "plan_live_pm20");
    vi.stubEnv("RAZORPAY_TEAM_STANDARD_ID", "plan_live_team_std");

    expect(getRazorpayPlanId("pro")).toBe("plan_live_pro");
    expect(getRazorpayPlanId("pro", undefined, undefined, "yearly")).toBe("plan_live_pro_yearly");
    expect(getRazorpayPlanId("proMax", undefined, "5x")).toBe("plan_live_pm5");
    expect(getRazorpayPlanId("proMax", undefined, "20x")).toBe("plan_live_pm20");
    expect(getRazorpayPlanId("team", "standard")).toBe("plan_live_team_std");

    expect(resolveTierFromRazorpayPlanId("plan_live_pro")).toEqual({ tier: "pro", billingFrequency: "monthly" });
    expect(resolveTierFromRazorpayPlanId("plan_live_pro_yearly")).toEqual({ tier: "pro", billingFrequency: "yearly" });
    expect(resolveTierFromRazorpayPlanId("plan_live_pm5")).toEqual({ tier: "proMax", proMaxVariant: "5x", billingFrequency: "monthly" });
    expect(resolveTierFromRazorpayPlanId("plan_live_pm20")).toEqual({ tier: "proMax", proMaxVariant: "20x", billingFrequency: "monthly" });
  });

  it("still reads the RAZORPAY_PLAN_ID_* names, which win when both are set", () => {
    vi.stubEnv("RAZORPAY_PLAN_ID_PRO", "plan_a");
    vi.stubEnv("RAZORPAY_PRO_ID", "plan_b");
    expect(getRazorpayPlanId("pro")).toBe("plan_a");
  });

  it("an unconfigured plan is null and an unknown plan id never resolves", () => {
    expect(getRazorpayPlanId("pro", undefined, undefined, "yearly")).toBeNull();
    expect(resolveTierFromRazorpayPlanId("plan_unknown")).toBeNull();
    expect(resolveTierFromRazorpayPlanId("")).toBeNull();
  });
});
