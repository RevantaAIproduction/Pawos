import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.USAGE_CREDITS_TOPUP_PRESETS;
  delete process.env.USAGE_CREDITS_MIN_TOPUP_USD;
  delete process.env.TICKET_BALANCE_USD_INR_RATE;
});

describe("usage credits purchase configuration", () => {
  it("serves presets, bounds, INR rate and PC per dollar from server configuration", async () => {
    process.env.USAGE_CREDITS_TOPUP_PRESETS = "7, 15, 40";
    process.env.USAGE_CREDITS_MIN_TOPUP_USD = "7";
    process.env.TICKET_BALANCE_USD_INR_RATE = "90";
    const body = await (await GET()).json();
    expect(body).toEqual({ topupPresetsUsd: [7, 15, 40], minTopupUsd: 7, maxTopupUsd: expect.any(Number), usdInrRate: 90, pcPerUsd: 100 });
  });

  it("exposes no private economics", async () => {
    const text = JSON.stringify(await (await GET()).json()).toLowerCase();
    for (const word of ["allowance", "micro", "ratio", "cost", "provider", "gemini"]) expect(text).not.toContain(word);
  });
});
