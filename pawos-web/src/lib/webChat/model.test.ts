import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEADLINE_ATTEMPTS, MIN_ATTEMPT_MS, MODEL_ATTEMPTS, MODEL_ATTEMPT_TIMEOUT_MS, RETRY_BASE_MS, RETRY_MAX_DELAY_MS, generate, modelClock, resetModelState } from "./model";

/**
 * The model call behind a chat reply. It has to end — with a reply or with PawOS's own "try again" —
 * before the gateway's 60 seconds, so a hung or busy model is asked once more and then given up on.
 */
const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
const request = { system: "You are Paw.", contents: [{ role: "user" as const, parts: [{ text: "hii" }] }], maxOutputTokens: 64 };
let answers: (Response | Error | (() => Response | Error))[];
let calls: { timeout: number | null }[];
let timeouts: number[];
const realTimeout = AbortSignal.timeout;
/** The test's clock: waits are recorded and pass at once; `now` only moves when a test moves it. */
let fakeNow: number;
let waits: number[];
let jitter: number;
const realClock = { ...modelClock };

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-model-key";
  resetModelState();
  answers = [];
  calls = [];
  timeouts = [];
  fakeNow = 1_000_000;
  waits = [];
  jitter = 0.5;
  modelClock.now = () => fakeNow;
  modelClock.sleep = async (ms: number) => {
    waits.push(ms);
    fakeNow += ms;
  };
  modelClock.random = () => jitter;
  vi.spyOn(console, "error").mockImplementation(() => {});
  AbortSignal.timeout = (ms: number) => {
    timeouts.push(ms);
    return realTimeout.call(AbortSignal, ms);
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls.push({ timeout: timeouts.at(-1) ?? null });
      const scripted = answers.shift();
      if (!scripted) throw new Error("no scripted answer");
      const next = typeof scripted === "function" ? scripted() : scripted;
      if (next instanceof Error) throw next;
      return next;
    })
  );
});

afterEach(() => {
  Object.assign(modelClock, realClock);
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

  it("a caller with its own timeout (a code change's long edit) keeps it, and a try that runs out of it is the last", async () => {
    answers = [Object.assign(new Error("timeout"), { name: "TimeoutError" }), ok("never asked")];
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

  it("logs the provider's error class beside the HTTP status — the fixed word only, never its message", async () => {
    const failure = (status: number, error: unknown) => new Response(JSON.stringify({ error }), { status });
    answers = [failure(503, { code: 503, message: "The model is overloaded for key AIza-secret.", status: "UNAVAILABLE" }), failure(429, { message: "Quota exceeded for hii", status: "RESOURCE_EXHAUSTED" })];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", status: 502, detail: "model_http_429" });
    expect(logged()[0]).toMatch(/^\[web-chat\] model call failed: HTTP 503 UNAVAILABLE after \d+ms \(attempt 1 of 2\)$/);
    expect(logged()[1]).toMatch(/^\[web-chat\] trying the model again in \d+ms$/);
    expect(logged()[2]).toMatch(/^\[web-chat\] model call failed: HTTP 429 RESOURCE_EXHAUSTED after \d+ms \(attempt 2 of 2\)$/);
    // A class that isn't the provider's fixed word is not logged at all.
    answers = [failure(400, { status: "API key AIza-secret is invalid" })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_http_400" });
    expect(logged()[3]).toMatch(/^\[web-chat\] model call failed: HTTP 400 after \d+ms \(attempt 1 of 2\)$/);
    for (const line of logged()) expect(line).not.toMatch(/AIza|overloaded|Quota|hii|test-model-key/);
  });

  it.each([[502], [504]])("a gateway failure upstream (HTTP %i) is asked once more, then reported as that status", async (status) => {
    answers = [new Response("<html>bad gateway</html>", { status }), new Response("<html>bad gateway</html>", { status })];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", status: 502, detail: `model_http_${status}` });
    expect(calls).toHaveLength(2);
  });

  it("a reply that isn't the JSON it should be is an empty reply, not a crash", async () => {
    answers = [new Response("<html>not json</html>", { status: 200 })];
    await expect(generate(request)).rejects.toMatchObject({ code: "model_unavailable", detail: "model_empty_reply" });
    expect(calls).toHaveLength(1);
  });

  it("an empty reply logs why the provider stopped — its fixed word only", async () => {
    answers = [new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }), { status: 200 })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_empty_reply" });
    expect(logged()).toEqual(["[web-chat] model answered with nothing (finish reason MAX_TOKENS)"]);
    answers = [new Response(JSON.stringify({ candidates: [{ finishReason: "hii said AIza-secret", content: { parts: [] } }] }), { status: 200 })];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_empty_reply" });
    expect(logged()[1]).toBe("[web-chat] model answered with nothing");
  });

  describe("how much the model reasons", () => {
    const sentConfigs = () => (fetch as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls.map((call) => (JSON.parse(String(call[1].body)) as { generationConfig: Record<string, unknown> }).generationConfig);

    it("is the provider's default unless a caller asks — chat's request is unchanged", async () => {
      answers = [ok("Hi!")];
      await generate(request);
      expect(sentConfigs()).toEqual([{ maxOutputTokens: 64 }]);
    });

    it("a caller that asks for little reasoning gets it, so the answer has the call's time and tokens", async () => {
      answers = [ok("{}")];
      await generate({ ...request, json: true, thinking: "low" });
      expect(sentConfigs()).toEqual([{ maxOutputTokens: 64, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } }]);
    });

    it("a model that doesn't take the setting costs one extra call, once — then it is left out", async () => {
      answers = [new Response(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "Unknown name thinkingLevel" } }), { status: 400 }), ok("first"), ok("second")];
      expect((await generate({ ...request, thinking: "low" })).text).toBe("first");
      expect((await generate({ ...request, thinking: "low" })).text).toBe("second");
      expect(sentConfigs()).toEqual([{ maxOutputTokens: 64, thinkingConfig: { thinkingLevel: "low" } }, { maxOutputTokens: 64 }, { maxOutputTokens: 64 }]);
      expect(logged()).toEqual(["[web-chat] the model refused the thinking setting; it is left out from now on"]);
    });

    it("a request that is refused with or without the setting is still a failure a retry can't fix — and the setting is kept", async () => {
      answers = [new Response("no", { status: 400 }), new Response("no", { status: 400 }), ok("later")];
      await expect(generate({ ...request, thinking: "low" })).rejects.toMatchObject({ code: "model_unavailable", detail: "model_http_400" });
      expect(calls).toHaveLength(2);
      await generate({ ...request, thinking: "low" });
      expect(sentConfigs()[2]).toEqual({ maxOutputTokens: 64, thinkingConfig: { thinkingLevel: "low" } });
    });

    it("a busy model is not mistaken for one that refuses the setting", async () => {
      answers = [new Response("busy", { status: 503 }), ok("ok")];
      await generate({ ...request, thinking: "low" });
      expect(sentConfigs().map((config) => "thinkingConfig" in config)).toEqual([true, true]);
    });
  });

  it("a reply with no usage counts is reported as that — zeros that the usage engine charges in full, never a free call", async () => {
    answers = [new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi!" }] } }] }), { status: 200 })];
    const reply = await generate(request);
    expect(reply.usage).toEqual({ promptTokens: 0, candidatesTokens: 0, cachedTokens: 0, thoughtsTokens: 0 });
    expect(logged()).toEqual(["[web-chat] the model reported no usage for a completed call; it is settled at its full reservation"]);
  });

  it("without a key it says chat isn't available, and calls nothing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(generate(request)).rejects.toMatchObject({ code: "not_configured", status: 503 });
    expect(calls).toHaveLength(0);
  });
});

/**
 * A provider that is briefly busy or rate-limiting is asked again — after a wait that grows and is
 * randomised (exponential backoff with full jitter), or exactly as long as the provider asked — and
 * only while that can still finish in time. Anything a wait can't fix fails at once.
 */
describe("asking a busy provider again", () => {
  const busy = (status = 503, headers: Record<string, string> = {}, body: unknown = { error: { status: "UNAVAILABLE" } }) => new Response(JSON.stringify(body), { status, headers });
  const AGENT_DEADLINE = 55_000;

  it("a 503 that clears: the next try answers, after a jittered wait no longer than the first backoff step", async () => {
    jitter = 0.7;
    answers = [busy(), ok("back")];
    expect((await generate(request)).text).toBe("back");
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([Math.round(0.7 * RETRY_BASE_MS)]);
  });

  it("the waits grow exponentially and are capped; the jitter is drawn from zero up to that step", async () => {
    jitter = 1;
    answers = [busy(), busy(), ok("third")];
    await generate({ ...request, timeoutMs: 120_000 });
    expect(waits).toEqual([RETRY_BASE_MS, 2 * RETRY_BASE_MS]);
    jitter = 0;
    answers = [busy(), ok("at once")];
    await generate({ ...request, timeoutMs: 120_000 });
    expect(waits.at(-1)).toBe(0);
    expect(Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_MS * 2 ** 10)).toBe(RETRY_MAX_DELAY_MS);
  });

  it("repeated 503s: a call with a deadline tries at most a fixed number of times, then reports the status", async () => {
    answers = [busy(), busy(), busy(), ok("never asked")];
    await expect(generate({ ...request, timeoutMs: AGENT_DEADLINE })).rejects.toMatchObject({ code: "model_unavailable", status: 502, detail: "model_http_503" });
    expect(calls).toHaveLength(DEADLINE_ATTEMPTS);
    expect(waits).toHaveLength(DEADLINE_ATTEMPTS - 1);
  });

  it("each try is given only what is left of the deadline — never more than the deadline in all", async () => {
    answers = [
      () => {
        fakeNow += 10_000; // the provider took 10 s to say it was busy
        return busy();
      },
      ok("in time"),
    ];
    await generate({ ...request, timeoutMs: AGENT_DEADLINE });
    expect(calls[0]!.timeout).toBe(AGENT_DEADLINE);
    expect(calls[1]!.timeout).toBe(AGENT_DEADLINE - 10_000 - waits[0]!);
  });

  it("with too little of the deadline left for a useful try, there is no other try", async () => {
    answers = [
      () => {
        fakeNow += AGENT_DEADLINE - MIN_ATTEMPT_MS + 1;
        return busy();
      },
      ok("never asked"),
    ];
    await expect(generate({ ...request, timeoutMs: AGENT_DEADLINE })).rejects.toMatchObject({ detail: "model_http_503" });
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("Retry-After (seconds) is honoured instead of the backoff, when there is time for it", async () => {
    answers = [busy(429, { "retry-after": "3" }, { error: { status: "RESOURCE_EXHAUSTED" } }), ok("after the wait")];
    expect((await generate({ ...request, timeoutMs: AGENT_DEADLINE })).text).toBe("after the wait");
    expect(waits).toEqual([3000]);
    expect(logged()[0]).toMatch(/HTTP 429 RESOURCE_EXHAUSTED after \d+ms \(attempt 1 of 3\), provider asked to wait 3000ms$/);
  });

  it("Google's RetryInfo delay in the error body is honoured too", async () => {
    answers = [busy(429, {}, { error: { status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2.5s" }] } }), ok("ok")];
    await generate({ ...request, timeoutMs: AGENT_DEADLINE });
    expect(waits).toEqual([2500]);
  });

  it("a wait longer than the time there is: no try is wasted — chat gives up at once, and so does a deadline it would overrun", async () => {
    answers = [busy(429, { "retry-after": "30" }), ok("never asked")];
    await expect(generate(request)).rejects.toMatchObject({ detail: "model_http_429" });
    expect(calls).toHaveLength(1);
    answers = [busy(429, { "retry-after": "40" }), ok("never asked")];
    await expect(generate({ ...request, timeoutMs: AGENT_DEADLINE })).rejects.toMatchObject({ detail: "model_http_429" });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([]);
  });

  it.each([[400], [401], [403], [404]])("HTTP %i is not something a wait fixes: one try, no wait", async (status) => {
    answers = [new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), { status }), ok("never asked")];
    await expect(generate({ ...request, timeoutMs: AGENT_DEADLINE })).rejects.toMatchObject({ detail: `model_http_${status}` });
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("a connection that fails at once is tried again inside the deadline; a try that runs out of time is not", async () => {
    answers = [new TypeError("fetch failed"), ok("connected")];
    expect((await generate({ ...request, timeoutMs: AGENT_DEADLINE })).text).toBe("connected");
    expect(calls).toHaveLength(2);
    answers = [Object.assign(new Error("timed out"), { name: "TimeoutError" }), ok("never asked")];
    await expect(generate({ ...request, timeoutMs: AGENT_DEADLINE })).rejects.toMatchObject({ detail: "model_timeout" });
    expect(calls).toHaveLength(3);
  });

  it("nothing about the request is logged while retrying — statuses, timings and waits only", async () => {
    answers = [busy(503, {}, { error: { status: "UNAVAILABLE", message: "overloaded for key AIza-secret" } }), ok("fine")];
    await generate(request);
    for (const line of logged()) expect(line).not.toMatch(/AIza|overloaded|hii|You are Paw|test-model-key/);
  });
});
