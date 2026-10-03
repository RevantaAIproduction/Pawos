import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  createServiceClient: vi.fn(),
  sendEarlyAccessConfirmation: vi.fn(),
}));

vi.mock("../../../lib/supabase/serviceClient", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("../../../lib/mail/earlyAccessMailer", () => ({
  sendEarlyAccessConfirmation: mocks.sendEarlyAccessConfirmation,
}));

import { POST } from "./route";

const VALID = {
  name: "Ada Lovelace",
  email: "Ada@Example.com",
  role: "Founder",
  company: "Analytical Engines",
  githubProfile: "octocat",
  selectedWorkflows: ["fix-bug", "refactor-code"],
  customUseCase: "Ticket triage.",
};

let ipCounter = 0;
/** Each request gets its own IP unless one is given, so the rate limiter never couples tests. */
const req = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  new Request("https://pawos.test/api/early-access", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/early-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });
    mocks.sendEarlyAccessConfirmation.mockResolvedValue({ ok: true });
  });

  it("stores a registration with the fixed source and initial status", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.from).toHaveBeenCalledWith("early_access_registrations");
    expect(mocks.insert).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "Founder",
      company: "Analytical Engines",
      github_profile: "https://github.com/octocat",
      selected_workflows: ["fix-bug", "refactor-code"],
      custom_use_case: "Ticket triage.",
      source: "pawos-website-early-access",
      status: "registered",
    });
  });

  it("sends one confirmation email to the stored name and email, after the insert", async () => {
    await POST(req(VALID));
    expect(mocks.sendEarlyAccessConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.sendEarlyAccessConfirmation).toHaveBeenCalledWith("Ada Lovelace", "ada@example.com");
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendEarlyAccessConfirmation.mock.invocationCallOrder[0]
    );
  });

  it("still reports success when the confirmation email fails", async () => {
    mocks.sendEarlyAccessConfirmation.mockResolvedValue({ ok: false, message: "EAUTH 535" });
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("sends no email for a validation failure, duplicate, failed insert, missing config or honeypot", async () => {
    await POST(req({ ...VALID, email: "nope" }));
    mocks.insert.mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } });
    await POST(req(VALID));
    mocks.insert.mockResolvedValueOnce({ error: { code: "42P01", message: "missing" } });
    await POST(req(VALID));
    mocks.createServiceClient.mockImplementationOnce(() => {
      throw new Error("not configured");
    });
    await POST(req(VALID));
    await POST(req({ ...VALID, website: "https://spam.example" }));
    expect(mocks.sendEarlyAccessConfirmation).not.toHaveBeenCalled();
  });

  it("ignores a client-supplied source or status", async () => {
    await POST(req({ ...VALID, source: "evil", status: "invited" }));
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ source: "pawos-website-early-access", status: "registered" });
  });

  it("returns field errors and stores nothing when validation fails", async () => {
    const res = await POST(req({ ...VALID, email: "nope", selectedWorkflows: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(Object.keys(body.errors).sort()).toEqual(["email", "selectedWorkflows"]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("accepts a registration without company or GitHub profile", async () => {
    const res = await POST(req({ ...VALID, company: "", githubProfile: "" }));
    expect(res.status).toBe(200);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ company: null, github_profile: null });
  });

  it("rejects a registration without a use case", async () => {
    const res = await POST(req({ ...VALID, customUseCase: "  " }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors).toEqual({ customUseCase: "Tell us what you'd want PawOS to help you with." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await POST(req("not json"));
    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("reports a duplicate email as 409", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "duplicate" });
  });

  it("returns 500 without leaking the database error", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "42P01", message: 'relation "early_access_registrations" does not exist' } });
    const res = await POST(req(VALID));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
  });

  it("returns 503 when the service role isn't configured", async () => {
    mocks.createServiceClient.mockImplementation(() => {
      throw new Error("not configured");
    });
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
  });

  it("silently drops a honeypot submission", async () => {
    const res = await POST(req({ ...VALID, website: "https://spam.example" }));
    expect(res.status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rate limits repeated submissions from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await POST(req(VALID, "203.0.113.9"))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
