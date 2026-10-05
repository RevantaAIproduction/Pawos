import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  generateLink: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("../../../../../lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({ auth: { admin: { generateLink: state.generateLink } } }),
}));
vi.mock("../../../../../lib/mail/waitlistMailer", () => ({
  getTransporter: () => ({ sendMail: state.sendMail }),
  getFrom: () => "PawOS <team@example.com>",
}));

import { POST } from "./route";

const request = (email: string, host = "pawos.revantaai.com") =>
  new Request("https://pawos.revantaai.com/api/auth/password/forgot", {
    method: "POST",
    headers: { "content-type": "application/json", host, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ email }),
  });

beforeEach(() => {
  state.generateLink.mockReset();
  state.sendMail.mockReset().mockResolvedValue({});
});

describe("forgot password — sent by PawOS, not Supabase", () => {
  it("makes the link without Supabase sending anything, and emails it from PawOS", async () => {
    state.generateLink.mockResolvedValue({ data: { properties: { action_link: "https://x.supabase.co/auth/v1/verify?token=t&type=recovery" } }, error: null });
    const response = await POST(request("Ada@Example.com"));
    expect(response.status).toBe(200);
    expect(state.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "ada@example.com", options: { redirectTo: "https://pawos.revantaai.com/reset-password" } });
    const mail = state.sendMail.mock.calls[0][0];
    expect(mail.from).toBe("PawOS <team@example.com>");
    expect(mail.subject).toMatch(/^Reset your PawOS password \(requested .+ UTC\)$/);
    expect(mail.headers["X-Entity-Ref-ID"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(mail.html).toContain("Powered by Revanta AI");
    expect(mail.html).not.toMatch(/supabase ⚡|Opt out/i);
    expect(mail.html).toContain("https://x.supabase.co/auth/v1/verify?token=t&type=recovery");
  });

  it("the link always goes to PawOS, whatever Host the request claims", async () => {
    state.generateLink.mockResolvedValue({ data: { properties: { action_link: "https://x/verify" } }, error: null });
    await POST(request("bob@example.com", "evil.example"));
    expect(state.generateLink.mock.calls[0][0].options.redirectTo).toBe("https://pawos.revantaai.com/reset-password");
  });

  it("no account: the same answer, and no email", async () => {
    state.generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const response = await POST(request("nobody@example.com"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.sendMail).not.toHaveBeenCalled();
  });

  it("each email is distinct so mail apps don't thread them and hide the newest link", async () => {
    state.generateLink.mockResolvedValue({ data: { properties: { action_link: "https://x/verify" } }, error: null });
    await POST(request("dee@example.com"));
    await POST(request("dee@example.com"));
    const [first, second] = state.sendMail.mock.calls.map((c) => c[0]);
    expect(first.headers["X-Entity-Ref-ID"]).not.toBe(second.headers["X-Entity-Ref-ID"]);
    expect(first.html).toContain("only the newest reset email works");
  });

  it("rejects a bad email", async () => {
    expect((await POST(request("nope"))).status).toBe(400);
  });

  it("limits repeated requests for one email", async () => {
    state.generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await POST(request("limit@example.com"))).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
