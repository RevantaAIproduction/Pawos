import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_ATTEMPTS, MODEL_ATTEMPT_TIMEOUT_MS, generate } from "./model";

/**
 * The model call behind a chat reply. It has to end — with a reply or with PawOS's own "try again" —
 * before the gateway's 60 seconds, so a hung or busy model is asked once more and then given up on.
 */
const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
const request = { system: "You are Paw.", contents: [{ role: "user" as const, parts: [{ text: "hii" }] }], maxOutputTokens: 64 };
let answers: (Response | Error)[];
let calls: { timeout: number | null }[];
let timeouts: number[];
const realTimeout = AbortSignal.timeout;

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-model-key";
  answers = [];
  calls = [];
  timeouts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  AbortSignal.timeout = (ms: number) => {
    timeouts.push(ms);
    return realTimeout.call(AbortSignal, ms);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls.push({ timeout: timeouts.at(-1) ?? null });
      const next = answers.shift();
      if (!next) throw new Error("no scripted answer");
      if (next instanceof Error) throw next;
      return next;
    })
  );
});

afterEach(() => {
  AbortSignal.timeout = realTimeout;
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const logged = () => (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));

describe("generate", () => {
  it("returns the model's reply from a single call when it answers", async () => {
    answers = [ok("Hi! How can I help?")];
    expect((await generate(request)).text).toBe("Hi! How can I help?");
    expect(calls).toHaveLength(1);
    expect(logged()).toEqual([]);
  });

  it("a model that hangs is asked once more, and the second answer is used", async () => {
    answers = [Object.assign(new Error("timed out"), { name: "TimeoutError" }), ok("Hello again.")];
    expect((await generate(request)).text).toBe("Hello again.");
    expect(calls).toHaveLength(2);
    expect(logged()[0]).toMatch(/^\[web-chat\] model call got no answer after \d+ms \(attempt 1 of 2\)$/);
  });

  it.each([[429], [500], [503]])("a busy model (HTTP %i) is asked once more", async (status) => {
    answers = [new Response("busy", { status }), ok("Now I can answer.")];
    expect((await generate(request)).text).toBe("Now I can answer.");
    expect(calls).toHaveLength(2);
    expect(logged()[0]).toMatch(new RegExp(`^\\[web-chat\\] model call failed: HTTP ${status} after \\d+ms \\(attempt 1 of 2\\)$`));
  });

  it("two failures end in PawOS's own message — never more than two calls", async () => {
    for (const pair of [[new Error("timeout"), new Error("timeout")], [new Response("busy", { status: 503 }), new Response("busy", { status: 503 })], [new Error("timeout"), new Response("quota", { status: 429 })]]) {
      answers = [...pair, ok("too late")];
      calls = [];
      await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", status: 502, message: "Paw couldn't answer just now. Please try again." });
      expect(calls).toHaveLength(MODEL_ATTEMPTS);
    }
  });

  it.each([[400], [401], [403], [404]])("a failure a retry can't fix (HTTP %i) is not retried", async (status) => {
    answers = [new Response("no", { status }), ok("never asked")];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", status: 502 });
    expect(calls).toHaveLength(1);
  });

  it("both tries together finish inside the gateway's minute", () => {
    expect(MODEL_ATTEMPTS * MODEL_ATTEMPT_TIMEOUT_MS).toBeLessThanOrEqual(55_000);
  });

  it("each try has its own time limit", async () => {
    answers = [new Error("timeout"), ok("ok")];
    await generate(request);
    expect(calls.map((call) => call.timeout)).toEqual([MODEL_ATTEMPT_TIMEOUT_MS, MODEL_ATTEMPT_TIMEOUT_MS]);
  });

  it("a caller with its own timeout (a code change's long edit) keeps it and gets one try, as before", async () => {
    answers = [new Error("timeout"), ok("never asked")];
    await expect(generate({ ...request, timeoutMs: 120_000 })).rejects.toMatchObject({ code: "model_unavailable" });
    expect(calls).toEqual([{ timeout: 120_000 }]);
  });

  it("an empty reply is still an error, and nothing sensitive is ever logged", async () => {
    answers = [ok("   ")];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable" });
    answers = [new Response("busy", { status: 503 }), new Response("busy", { status: 503 })];
    await expect(generate(request)).rejects.toBeTruthy();
    for (const line of logged()) expect(line).not.toMatch(/test-model-key|hii|You are Paw/);
  });

  it("says which kind of failure it was — a class only, for debugging", async () => {
    answers = [new Error("timeout"), new Error("timeout")];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", detail: "model_timeout" });
    answers = [new Response("quota", { status: 429 }), new Response("quota", { status: 429 })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_http_429" });
    answers = [new Error("timeout"), new Response("overloaded", { status: 503 })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_http_503" });
    answers = [new Response("bad key", { status: 403 })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_http_403" });
    answers = [ok("  ")];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_empty_reply" });
    // The provider's own words never travel with it.
    answers = [new Response("API key AIza-secret is invalid", { status: 403 })];
    const error = await generate(request).catch((caught: unknown) => caught as { message: string; detail: string });
    expect(JSON.stringify({ message: error.message, detail: error.detail })).not.toMatch(/AIza|invalid|API key/);
  });

  it("without a key it says chat isn't available, and calls nothing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generate(request)).rejects.toMatchObject({ code: "not_configured", status: 503 });
    expect(calls).toHaveLength(0);
  });
});
