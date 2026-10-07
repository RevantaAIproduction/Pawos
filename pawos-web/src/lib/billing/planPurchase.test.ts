import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlanPurchase, planSeats } from "./planPurchase";

/** A plan payment reaches the database once, with the organization and buyer the server chose. */
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;
const base = { paymentId: "pay_1", orderId: "order_1", organizationId: "org-1", buyerUserId: "user-1", tier: "team" as const, seatTier: "premium" as const, seats: 3 };

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("applyPlanPurchase", () => {
  it("sends the payment, organization, buyer, tier and seats to the service-only function", async () => {
    rpc.mockResolvedValue({ data: { applied: true }, error: null });
    expect(await applyPlanPurchase(client, base)).toBe("applied");
    expect(rpc).toHaveBeenCalledWith("pawos_apply_plan_purchase", {
      p_payment_id: "pay_1",
      p_order_id: "order_1",
      p_organization_id: "org-1",
      p_buyer_user_id: "user-1",
      p_tier: "team",
      p_seat_tier: "premium",
      p_seats: 3,
    });
  });

  it("reports a payment the database has already applied (a retry, the webhook, a replay)", async () => {
    rpc.mockResolvedValue({ data: { applied: false, seatCount: 9 }, error: null });
    expect(await applyPlanPurchase(client, base)).toBe("already-applied");
  });

  it("sends no seat tier for Enterprise, whose seats are uniform", async () => {
    rpc.mockResolvedValue({ data: { applied: true }, error: null });
    await applyPlanPurchase(client, { ...base, tier: "enterprise", seatTier: "premium" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_tier: "enterprise", p_seat_tier: null });
  });

  it("says the function is unavailable when the migration has not been applied, so the caller can fall back", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await applyPlanPurchase(client, base)).toBe("unavailable");
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await applyPlanPurchase(client, base)).toBe("unavailable");
  });

  it("fails closed when the database refuses (for example the buyer does not own the organization)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "buyer_does_not_own_organization" } });
    expect(await applyPlanPurchase(client, base)).toBe("failed");
  });
});

describe("planSeats", () => {
  it("uses the seats on the order, or the plan's default when the order has none", () => {
    expect(planSeats("team", 7)).toBe(7);
    expect(planSeats("team", undefined)).toBe(2);
    expect(planSeats("enterprise", undefined)).toBe(20);
    expect(planSeats("team", 0)).toBe(2);
    expect(planSeats("team", Number.NaN)).toBe(2);
    expect(planSeats("enterprise", 2.5)).toBe(20);
  });
});
