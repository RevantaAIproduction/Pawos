import { beforeEach, describe, expect, it } from "vitest";
import { toSubscriptionRecord } from "./subscriptionRecords";

const NOW = Date.parse("2026-09-25T12:00:00Z");

beforeEach(() => {
  process.env.RAZORPAY_PLAN_ID_PRO = "plan_pro";
  process.env.RAZORPAY_PLAN_ID_PROMAX_5X = "plan_pm5";
  process.env.RAZORPAY_PLAN_ID_PROMAX_20X = "plan_pm20";
  process.env.RAZORPAY_PLAN_ID_TEAM_STANDARD = "plan_team";
  process.env.RAZORPAY_PLAN_ID_TEAM_SEAT_STANDARD = "plan_team";
});

describe("toSubscriptionRecord", () => {
  it("stores a Pro plan against the userId from Razorpay's notes, paid through current_end", () => {
    const built = toSubscriptionRecord(
      { id: "sub_1", plan_id: "plan_pro", status: "active", current_end: 1_761_000_000, notes: { userId: "user-1" } },
      "verify-subscription",
      NOW,
    );
    expect(built.record).toMatchObject({
      id: "sub_1",
      user_id: "user-1",
      tier: "pro",
      pro_max_variant: null,
      status: "active",
      current_period_end: new Date(1_761_000_000 * 1000).toISOString(),
      source: "verify-subscription",
    });
  });

  it("keeps the Pro Max variant", () => {
    expect(toSubscriptionRecord({ id: "s", plan_id: "plan_pm20", status: "active", current_end: 1, notes: { userId: "u" } }, "x", NOW).record).toMatchObject({ tier: "proMax", pro_max_variant: "20x" });
    expect(toSubscriptionRecord({ id: "s", plan_id: "plan_pm5", status: "active", current_end: 1, notes: { userId: "u" } }, "x", NOW).record).toMatchObject({ tier: "proMax", pro_max_variant: "5x" });
  });

  it("before the first charge (no current_end) falls back to charge_at, then one month", () => {
    const withCharge = toSubscriptionRecord({ id: "s", plan_id: "plan_pro", status: "authenticated", charge_at: 1_760_000_000, notes: { userId: "u" } }, "x", NOW);
    expect(withCharge.record?.current_period_end).toBe(new Date(1_760_000_000 * 1000).toISOString());
    const bare = toSubscriptionRecord({ id: "s", plan_id: "plan_pro", status: "authenticated", notes: { userId: "u" } }, "x", NOW);
    expect(Date.parse(bare.record!.current_period_end) - NOW).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("never stores a plan without a userId, an unknown plan, or an organization plan", () => {
    expect(toSubscriptionRecord({ id: "s", plan_id: "plan_pro", status: "active" }, "x", NOW).record).toBeNull();
    expect(toSubscriptionRecord({ id: "s", plan_id: "plan_other", status: "active", notes: { userId: "u" } }, "x", NOW).record).toBeNull();
  });
});
