import { describe, expect, it } from "vitest";
import type { AccountOverview } from "../shared";
import { creditsRow, usageRows } from "./account";

/**
 * `pawos status` shows usage exactly as PawOS returned it. PawOS decides what is shown as used (the
 * amount follows the usage bar: a Pro plan at 97% is 1,940 of 2,000 PC); the CLI works nothing out
 * of its own, and has no private allowance or provider cost to show.
 */
const text = (lines: ReturnType<typeof usageRows>) => lines.map((line) => line.map((part) => (typeof part === "string" ? part : part.text)).join("")).join("\n");

const overview = (buckets: Record<string, unknown>[], extra: Record<string, unknown> = {}): AccountOverview =>
  ({ plan: { tier: "pro", label: "Paw Pro" }, usage: { planLabel: "Pro plan", buckets, weeklyPacing: null, creditsPcRemaining: 0, limitReached: false, limitReason: null, limitResetsAt: null, ...extra }, integrations: null }) as unknown as AccountOverview;

describe("usage, as PawOS returns it", () => {
  it.each([
    ["Pro at 90%", 1800, 2000],
    ["Pro at 97% ($19.40 of $20)", 1940, 2000],
    ["Pro at 100% ($20 of $20)", 2000, 2000],
    ["Pro Max 5x at 97%", 9700, 10000],
    ["Pro Max 20x at 97%", 24250, 25000],
  ])("%s is printed as given", (_name, pcUsed, pcTotal) => {
    const shown = text(usageRows(overview([{ id: "p", label: "Pro plan", type: "monthly_plan", pcTotal, pcUsed, percentUsed: 97, status: "active", resetsAt: "2026-10-29T00:00:00Z", expiresAt: null }])));
    expect(shown).toContain(`Pro plan: ${pcUsed.toLocaleString("en-US")} / ${pcTotal.toLocaleString("en-US")} PC, until 2026-10-29`);
  });

  it("a mid-month purchase is its own line, with its own numbers", () => {
    const shown = text(
      usageRows(
        overview([
          { id: "p", label: "Pro plan", type: "monthly_plan", pcTotal: 2000, pcUsed: 2000, percentUsed: 100, status: "active", resetsAt: null, expiresAt: null },
          { id: "m", label: "Pro extra usage", type: "mid_month_purchase", pcTotal: 1500, pcUsed: 1455, percentUsed: 97, status: "active", resetsAt: null, expiresAt: null },
        ])
      )
    );
    expect(shown).toContain("Pro plan: 2,000 / 2,000 PC");
    expect(shown).toContain("Pro extra usage: 1,455 / 1,500 PC");
  });

  it("credits left are the total less what PawOS shows as used — never a figure of the CLI's own", () => {
    const credits = (pcUsed: number) => text(creditsRow(overview([{ id: "c", label: "Credits", type: "purchased_credits", pcTotal: 1000, pcUsed, percentUsed: 0, status: "active", resetsAt: null, expiresAt: null }])));
    expect(credits(900)).toContain("100 PC");
    expect(credits(970)).toContain("30 PC");
    expect(credits(1000)).toContain("0 PC");
  });

  it("at 100% shown the plan is not called a reached limit unless PawOS says the limit is reached", () => {
    const bucket = { id: "p", label: "Pro plan", type: "monthly_plan", pcTotal: 2000, pcUsed: 2000, percentUsed: 100, status: "active", resetsAt: null, expiresAt: null };
    expect(text(usageRows(overview([bucket])))).not.toMatch(/limit reached/i);
    expect(text(usageRows(overview([bucket], { limitReached: true })))).toMatch(/Limit reached/);
  });

  it("nothing private can be printed: only the fields PawOS's summary has are read", () => {
    const shown = text(
      usageRows(overview([{ id: "p", label: "Pro plan", type: "monthly_plan", pcTotal: 2000, pcUsed: 1940, percentUsed: 97, status: "active", resetsAt: null, expiresAt: null, privateAllowanceMicroUsd: 10000000, consumedMicroUsd: 9500000 }]))
    );
    expect(shown).not.toMatch(/10000000|9500000|micro|allowance|\$/i);
  });
});
