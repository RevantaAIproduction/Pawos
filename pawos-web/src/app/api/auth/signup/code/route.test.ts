import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ generateLink: vi.fn(), sendMail: vi.fn() }));

vi.mock("../../../../../lib/supabase/serviceClient", () => ({
  createServiceClient: () => ({ auth: { admin: { generateLink: state.generateLink } } }),
}));
vi.mock("../../../../../lib/mail/waitlistMailer", () => ({
  getTransporter: () => ({ sendMail: state.sendMail }),
  getFrom: () => "PawOS <team@example.com>",
}));

import { POST } from "./route";

let n = 0;
const request = (body: Record<string, unknown>) =>
  new Request("https://pawos.revantaai.com/api/auth/signup/code", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${n++ % 250}` },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.generateLink.mockReset();
  state.sendMail.mockReset().mockResolvedValue({});
});

describe("sign-up code — emailed by PawOS, not Supabase", () => {
  it("a new email: Supabase makes the code (no email), PawOS sends it", async () => {
    state.generateLink.mockResolvedValueOnce({ data: { user: { id: "u1" }, properties: { email_otp: "482913" } }, error: null });
    const response = await POST(request({ email: "Ada@Example.com", firstName: "Ada", lastName: "Lovelace" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, verifyType: "signup" });
    const call = state.generateLink.mock.calls[0][0];
    expect(call).toMatchObject({ type: "signup", email: "ada@example.com", options: { data: { full_name: "Ada Lovelace", first_name: "Ada", last_name: "Lovelace" } } });
    expect(call.password.length).toBeGreaterThanOrEqual(32);
    const mail = state.sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("482913 is your PawOS verification code");
    expect(mail.html).toContain("482913");
    expect(mail.html).toContain("Powered by Revanta AI");
    expect(mail.html).not.toMatch(/supabase/i);
  });

  it("an unfinished earlier sign-up: a fresh code", async () => {
    state.generateLink
      .mockResolvedValueOnce({ data: null, error: { code: "email_exists" } })
      .mockResolvedValueOnce({ data: { user: { email_confirmed_at: null, last_sign_in_at: null }, properties: { email_otp: "111222" } }, error: null });
    const response = await POST(request({ email: "half@example.com", firstName: "Half" }));
    await expect(response.json()).resolves.toEqual({ ok: true, verifyType: "email" });
    expect(state.sendMail.mock.calls[0][0].html).toContain("111222");
  });

  it("an existing account: log in instead, and no email", async () => {
    state.generateLink
      .mockResolvedValueOnce({ data: null, error: { code: "email_exists" } })
      .mockResolvedValueOnce({ data: { user: { email_confirmed_at: "2026-01-01", last_sign_in_at: "2026-02-01" }, properties: { email_otp: "999999" } }, error: null });
    const response = await POST(request({ email: "taken@example.com", firstName: "T" }));
    expect(response.status).toBe(409);
    expect(state.sendMail).not.toHaveBeenCalled();
  });

  it("needs a first name and a valid email", async () => {
    expect((await POST(request({ email: "a@example.com", firstName: "" }))).status).toBe(400);
    expect((await POST(request({ email: "nope", firstName: "A" }))).status).toBe(400);
    expect(state.generateLink).not.toHaveBeenCalled();
  });
});
