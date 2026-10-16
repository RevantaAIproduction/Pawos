import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountContext } from "../account/accountContext";

/**
 * Image generation, server side: the model adapter and the generation flow. The database functions
 * are mocked here (they are tested on a real local database in supabase/tests/image_generation);
 * this proves what the server sends them, in what order, and that the model is called only after a
 * hold — once — and never with anything the client chose about money.
 */
const state = vi.hoisted(() => ({
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  rpcAnswers: {} as Record<string, unknown[]>,
  uploads: [] as { path: string; size: number; contentType: string }[],
  uploadError: null as null | { message: string },
  /** When set, the upload doesn't answer until this is resolved (the late upload). */
  uploadGate: null as null | Promise<void>,
  removed: [] as string[][],
  downloads: {} as Record<string, Uint8Array>,
  /** Each RPC's abort signal, by call order (every database call in the flow must be bounded). */
  rpcSignals: [] as (AbortSignal | null)[],
}));

vi.mock("../supabase/serviceClient", () => ({
  createServiceClient: () => ({
    // Like the real client: rpc() returns a builder that can take an abort signal and is awaited.
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcs.push({ name, args });
      const index = state.rpcSignals.push(null) - 1;
      const queue = state.rpcAnswers[name] ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      const answer = Promise.resolve(next ?? { data: null, error: { message: `no answer for ${name}` } });
      return Object.assign(answer, {
        abortSignal: (signal: AbortSignal) => {
          state.rpcSignals[index] = signal;
          return answer;
        },
      });
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array, options: { contentType: string }) => {
          if (state.uploadGate) await state.uploadGate;
          if (state.uploadError) return { data: null, error: state.uploadError };
          state.uploads.push({ path, size: bytes.length, contentType: options.contentType });
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { data: [], error: null };
        },
        download: async (path: string) => (state.downloads[path] ? { data: new Blob([state.downloads[path]]), error: null } : { data: null, error: { message: "missing" } }),
      }),
    },
  }),
}));
vi.mock("../billing/razorpay", () => ({ getRazorpayCredentials: () => ({ keyId: "k", keySecret: "s" }) }));

import { DEFAULT_IMAGE_MODEL, callImageModel, imageModel, readImageAnswer } from "./imageModel";
import {
  FREE_IMAGES_USED_MESSAGE,
  IMAGE_CHARGE_PC,
  DB_CALL_TIMEOUT_MS,
  IMAGE_LEASE_MS,
  ImageGenerationError,
  STORAGE_READ_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  fundingFor,
  generateImage,
  imageAllowance,
  parseImageRequest,
  readGeneratedImage,
  recoverStaleImageGenerations,
} from "./imageGeneration";
import { IMAGE_CALL_TIMEOUT_MS } from "./imageModel";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const imageAnswer = (bytes = PNG, extra: Record<string, unknown> = {}) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: b64(bytes) } }] } }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 1120 },
  ...extra,
});

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const GEN = "33333333-3333-4333-8333-333333333333";
const account = (tier: string, organizations: { id: string; name: string; tier: string; role: string }[] = []) =>
  ({ user: { id: USER, email: "a@b.com" }, tier, organizations }) as unknown as AccountContext;
const row = (over: Record<string, unknown> = {}) => ({ id: GEN, status: "pending", funding: "bucket", chargedPcTenths: 0, mimeType: null, sizeBytes: null, storagePath: null, aspectRatio: "1:1", imageSize: "1K", errorCode: null, ...over });
const ok = (data: unknown) => ({ data, error: null });

let calls: { url: string; init: RequestInit }[];
let answers: (Response | Error)[];
beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  delete process.env.WEB_IMAGE_MODEL;
  state.rpcs = [];
  state.uploads = [];
  state.uploadError = null;
  state.uploadGate = null;
  state.removed = [];
  state.downloads = {};
  state.rpcSignals = [];
  state.rpcAnswers = {
    begin_image_generation: [ok({ ok: true, image: row(), chargePcTenths: 97 })],
    complete_image_generation: [ok({ ok: true, image: row({ status: "succeeded", chargedPcTenths: 97, mimeType: "image/png", sizeBytes: PNG.length, storagePath: `${USER}/${GEN}.png` }) })],
    fail_image_generation: [ok({ ok: true, image: row({ status: "failed" }) })],
  };
  calls = [];
  answers = [new Response(JSON.stringify(imageAnswer()), { status: 200 })];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init });
      const next = answers.shift();
      if (!next) throw new Error("no scripted answer");
      if (next instanceof Error) throw next;
      return next;
    })
  );
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const rpcNames = () => state.rpcs.map((call) => call.name);
const request = (over: Record<string, unknown> = {}) => ({ requestId: "req-0001", prompt: "A red fox in the snow", aspectRatio: "16:9", ...over });

describe("the image model adapter", () => {
  it("asks for an image at the chosen ratio and size, with the key in a header — never in the URL", async () => {
    const result = await callImageModel({ prompt: "A red fox", aspectRatio: "16:9", imageSize: "1K" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent");
    expect(calls[0]!.url).not.toContain("test-gemini-key");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      contents: [{ role: "user", parts: [{ text: "A red fox" }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9", imageSize: "1K" } },
    });
  });

  it("the model is a server setting, with the agreed default", () => {
    expect(imageModel()).toBe(DEFAULT_IMAGE_MODEL);
    expect(DEFAULT_IMAGE_MODEL).toBe("gemini-3.1-flash-lite-image");
    process.env.WEB_IMAGE_MODEL = "gemini-nano-banana-2.1";
    expect(imageModel()).toBe("gemini-nano-banana-2.1");
    process.env.WEB_IMAGE_MODEL = "../../etc";
    expect(imageModel()).toBe(DEFAULT_IMAGE_MODEL);
  });

  it("returns the real image bytes and the usage the provider reported", () => {
    const result = readImageAnswer(imageAnswer());
    expect(result).toMatchObject({ ok: true, image: { mimeType: "image/png", promptTokens: 12, outputTokens: 1120 } });
    if (result.ok) expect(Array.from(result.image.bytes)).toEqual(Array.from(PNG));
  });

  it("takes the final image, not a draft 'thought' image, and decides the type from the bytes", () => {
    const answer = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64(PNG) }, thought: true }, { text: "Here you go" }, { inlineData: { mimeType: "image/png", data: b64(JPEG) } }] } }] };
    const result = readImageAnswer(answer);
    expect(result).toMatchObject({ ok: true, image: { mimeType: "image/jpeg" } });
  });

  it.each([
    ["a refused prompt", { promptFeedback: { blockReason: "SAFETY" } }, { kind: "refused", reason: "SAFETY" }],
    ["an unsafe picture", { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }, { kind: "refused", reason: "IMAGE_SAFETY" }],
    ["no image", { candidates: [{ finishReason: "NO_IMAGE", content: { parts: [{ text: "I can only describe it." }] } }] }, { kind: "no_image", reason: "NO_IMAGE" }],
    ["text only", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "a picture of a fox" }] } }] }, { kind: "no_image", reason: "STOP" }],
    ["no candidates", {}, { kind: "no_image", reason: "NO_CANDIDATE" }],
    ["bytes that are not an image", { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: b64(Uint8Array.from([1, 2, 3, 4, 5])) } }] } }] }, { kind: "no_image", reason: "NOT_AN_IMAGE" }],
    ["an empty image", { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "" } }] } }] }, { kind: "no_image", reason: "NO_IMAGE" }],
  ])("%s is never an image", (_name, answer, failure) => {
    expect(readImageAnswer(answer as never)).toMatchObject({ ok: false, failure });
  });

  it("a provider's own words never travel with a refusal", () => {
    const result = readImageAnswer({ promptFeedback: { blockReason: "Blocked because of words: secret prompt" } });
    expect(JSON.stringify(result)).not.toContain("secret prompt");
  });

  it.each([
    ["busy", () => new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 }), "model_http_503"],
    ["rate limited", () => new Response("{}", { status: 429 }), "model_http_429"],
    ["a bad request", () => new Response("{}", { status: 400 }), "model_http_400"],
    ["no answer", () => Object.assign(new Error("timeout"), { name: "TimeoutError" }), "model_timeout"],
  ])("a provider that is %s is reported as unavailable — and the call is made once", async (_name, make, detail) => {
    answers = [make() as Response, new Response(JSON.stringify(imageAnswer()), { status: 200 })];
    const result = await callImageModel({ prompt: "x", aspectRatio: "1:1", imageSize: "1K" });
    expect(result).toMatchObject({ ok: false, failure: { kind: "unavailable", detail } });
    expect(calls).toHaveLength(1);
  });

  it("without a key it calls nothing", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await callImageModel({ prompt: "x", aspectRatio: "1:1", imageSize: "1K" })).toMatchObject({ ok: false, failure: { kind: "not_configured" } });
    expect(calls).toHaveLength(0);
  });

  it("logs nothing that identifies the prompt or the key", async () => {
    answers = [new Response(JSON.stringify({ error: { status: "UNAVAILABLE", message: "prompt was: secret thing" } }), { status: 503 })];
    await callImageModel({ prompt: "secret thing", aspectRatio: "1:1", imageSize: "1K" });
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/HTTP 503 UNAVAILABLE/);
    expect(logged).not.toMatch(/secret|test-gemini-key/);
  });
});

describe("what a request may ask for", () => {
  it.each([
    [{ requestId: "short", prompt: "x" }, /request id/],
    [{ requestId: "req-0001", prompt: "   " }, /Describe the image/],
    [{ requestId: "req-0001", prompt: "x".repeat(2001) }, /up to 2,000/],
    [{ requestId: "req-0001", prompt: "x", aspectRatio: "7:3" }, /aspect ratio/],
    [{ requestId: "req-0001", prompt: "x", imageSize: "2K" }, /standard \(1K\)/],
    [{ requestId: "req-0001", prompt: "x", imageSize: "1k" }, /standard \(1K\)/],
  ])("%j is refused", (body, message) => {
    const parsed = parseImageRequest(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toMatch(message);
  });

  it("defaults to a square standard image", () => {
    expect(parseImageRequest({ requestId: "req-0001", prompt: "a fox" })).toEqual({ ok: true, request: { requestId: "req-0001", prompt: "a fox", aspectRatio: "1:1", imageSize: "1K" } });
  });

  it("an invalid request is refused before anything is held or the model is called", async () => {
    await expect(generateImage(account("pro"), { requestId: "req-0001", prompt: "" })).rejects.toMatchObject({ code: "invalid_message", status: 400 });
    expect(state.rpcs).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("what pays, by plan", () => {
  it("Pro, Pro Max and Team: the usage buckets (a Team member's own seat); Enterprise: its pool; Go and Build: free images, then credits", () => {
    for (const tier of ["pro", "proMax", "team"]) expect(fundingFor({ tier } as AccountContext)).toBe("buckets");
    expect(fundingFor({ tier: "enterprise" } as AccountContext)).toBe("organization");
    for (const tier of ["go", "build"]) expect(fundingFor({ tier } as AccountContext)).toBe("free_then_credits");
  });

  it("the server sends the account's own id and its plan's funding — nothing the client sent about money", async () => {
    await generateImage(account("pro"), { ...request(), chargePc: 0, funding: "free_then_credits", userId: "someone-else", organizationId: ORG });
    expect(state.rpcs[0]).toEqual({
      name: "begin_image_generation",
      args: { p_user_id: USER, p_request_key: "req-0001", p_model: "gemini-3.1-flash-lite-image", p_aspect_ratio: "16:9", p_image_size: "1K", p_funding: "buckets", p_organization_id: null },
    });
  });

  it("Enterprise uses the account's own Enterprise organization", async () => {
    await generateImage(account("enterprise", [{ id: ORG, name: "Acme", tier: "enterprise", role: "member" }]), request());
    expect(state.rpcs[0]!.args).toMatchObject({ p_funding: "organization", p_organization_id: ORG });
  });

  it("Enterprise without an organization is refused before anything is held", async () => {
    await expect(generateImage(account("enterprise"), request())).rejects.toMatchObject({ status: 503 });
    expect(state.rpcs).toEqual([]);
  });
});

describe("one generation", () => {
  it("success: held first, then one model call, then stored privately, then charged — in that order", async () => {
    const image = await generateImage(account("pro"), request());
    expect(rpcNames()).toEqual(["begin_image_generation", "complete_image_generation"]);
    expect(calls).toHaveLength(1);
    expect(state.uploads).toEqual([{ path: `${USER}/${GEN}.png`, size: PNG.length, contentType: "image/png" }]);
    expect(state.rpcs[1]!.args).toEqual({ p_user_id: USER, p_generation_id: GEN, p_mime_type: "image/png", p_size_bytes: PNG.length, p_storage_path: `${USER}/${GEN}.png`, p_prompt_tokens: 12, p_output_tokens: 1120 });
    expect(image).toEqual({ id: GEN, status: "succeeded", mimeType: "image/png", sizeBytes: PNG.length, aspectRatio: "1:1", imageSize: "1K", chargedPc: 9.7, funding: "bucket", url: `/api/web/images/${GEN}` });
  });

  it("the price is 9.7 PC: 100 images are 970 PC", () => {
    expect(IMAGE_CHARGE_PC).toBe(9.7);
    expect(Math.round(IMAGE_CHARGE_PC * 100 * 10) / 10).toBe(970);
  });

  it("refused before the model is called: no allowance, weekly pace, Enterprise pool used", async () => {
    for (const [reason, message] of [
      ["no_allowance", /included usage is used up/],
      ["plan_weekly_paced", /week's usage pace/],
      ["organization_limit", /organization's shared usage/],
    ] as const) {
      state.rpcs = [];
      state.rpcAnswers.begin_image_generation = [ok({ ok: false, reason })];
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "usage_limit_reached", status: 402, message: expect.stringMatching(message) });
      expect(calls).toHaveLength(0);
      expect(rpcNames()).toEqual(["begin_image_generation"]);
    }
  });

  it("Paw Go after its three free images: the agreed message, with Upgrade Plan and Buy Credits", async () => {
    state.rpcAnswers.begin_image_generation = [ok({ ok: false, reason: "free_images_used" })];
    const error = (await generateImage(account("go"), request()).catch((e: unknown) => e)) as ImageGenerationError;
    expect(error).toBeInstanceOf(ImageGenerationError);
    expect(error.message).toBe("You've used your 3 free image generations. Upgrade your PawOS plan or purchase additional credits to generate more images.");
    expect(error.message).toBe(FREE_IMAGES_USED_MESSAGE);
    expect(error.actions).toEqual({ upgrade: true, buyCredits: true });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a refused prompt", () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }), "refused:safety", 422],
    ["no image", () => new Response(JSON.stringify({ candidates: [{ finishReason: "NO_IMAGE", content: { parts: [] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } }), { status: 200 }), "no_image:no_image", 502],
    ["a busy provider", () => new Response("{}", { status: 503 }), "model_http_503", 502],
  ])("%s: the hold is given back, the customer is told they weren't charged, and nothing is stored", async (_name, make, code, status) => {
    answers = [make()];
    const error = (await generateImage(account("pro"), request()).catch((e: unknown) => e)) as ImageGenerationError;
    expect(error.status).toBe(status);
    expect(error.message).toMatch(/weren't charged|differently/);
    expect(rpcNames()).toEqual(["begin_image_generation", "fail_image_generation"]);
    expect(state.rpcs[1]!.args).toMatchObject({ p_user_id: USER, p_generation_id: GEN, p_error_code: code });
    expect(state.uploads).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("an image that can't be stored is not charged", async () => {
    state.uploadError = { message: "bucket missing" };
    state.rpcAnswers.get_generated_image = [ok(row({ status: "failed", errorCode: "storage_failed" }))];
    await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "failed" });
    expect(rpcNames()).toEqual(["begin_image_generation", "fail_image_generation", "get_generated_image"]);
    expect(state.rpcs[1]!.args).toMatchObject({ p_error_code: "storage_failed", p_prompt_tokens: 12, p_output_tokens: 1120 });
  });

  it("the same request id again returns the first image — no second model call, no second charge", async () => {
    state.rpcAnswers.begin_image_generation = [ok({ ok: true, repeat: true, image: row({ status: "succeeded", chargedPcTenths: 97, mimeType: "image/png", sizeBytes: 16, storagePath: `${USER}/${GEN}.png` }) })];
    const image = await generateImage(account("pro"), request());
    expect(image).toMatchObject({ id: GEN, chargedPc: 9.7 });
    expect(calls).toHaveLength(0);
    expect(rpcNames()).toEqual(["begin_image_generation"]);
  });

  it("a request id still being generated, or one that failed, starts nothing new", async () => {
    state.rpcAnswers.begin_image_generation = [ok({ ok: true, repeat: true, image: row({ status: "pending" }) })];
    await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "processing", status: 409 });
    state.rpcAnswers.begin_image_generation = [ok({ ok: true, repeat: true, image: row({ status: "failed" }) })];
    await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });

  it("a free Go image is shown as costing nothing", async () => {
    state.rpcAnswers.complete_image_generation = [ok({ ok: true, image: row({ status: "succeeded", funding: "free", chargedPcTenths: 0, mimeType: "image/png", sizeBytes: 16, storagePath: `${USER}/${GEN}.png` }) })];
    expect(await generateImage(account("go"), request())).toMatchObject({ funding: "free", chargedPc: 0 });
    expect(state.rpcs[0]!.args).toMatchObject({ p_funding: "free_then_credits" });
  });
});

describe("recovery: the lease, late uploads, lost answers, retries and leftover files", () => {
  const PATH = `${USER}/${GEN}.png`;
  const succeeded = row({ status: "succeeded", chargedPcTenths: 97, mimeType: "image/png", sizeBytes: PNG.length, storagePath: PATH });
  const failed = (errorCode: string) => row({ status: "failed", errorCode });
  const ALL_PATHS = [`${USER}/${GEN}.png`, `${USER}/${GEN}.jpg`, `${USER}/${GEN}.webp`];
  const repeatOf = (image: ReturnType<typeof row>) => [ok({ ok: true, repeat: true, image })];

  it("the whole budget of one request fits well inside the database's lease, and the lease matches the migration", async () => {
    // begin + model + upload + complete + read + fail + read, every database call at its limit.
    const worst = DB_CALL_TIMEOUT_MS + IMAGE_CALL_TIMEOUT_MS + UPLOAD_TIMEOUT_MS + 4 * DB_CALL_TIMEOUT_MS;
    expect(worst).toBeLessThan(IMAGE_LEASE_MS - 60_000);
    // A retry that recovers a stored image: begin + three reads of storage + complete + read.
    expect(DB_CALL_TIMEOUT_MS + 3 * STORAGE_READ_TIMEOUT_MS + 2 * DB_CALL_TIMEOUT_MS).toBeLessThan(IMAGE_LEASE_MS - 60_000);
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const sql = readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261016000000_image_generation_recovery.sql", import.meta.url)), "utf8");
    expect(sql).toMatch(/least\(interval '5 minutes', s\.reservation_timeout \/ 2\)/);
    expect(IMAGE_LEASE_MS).toBe(5 * 60_000);
  });

  it("every database call in a generation is bounded by an abort signal", async () => {
    state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "57014" } }];
    state.rpcAnswers.get_generated_image = [ok(row({ status: "pending" })), ok(failed("settle_failed"))];
    await generateImage(account("pro"), request()).catch(() => {});
    expect(rpcNames()).toEqual(["begin_image_generation", "complete_image_generation", "get_generated_image", "fail_image_generation", "get_generated_image"]);
    expect(state.rpcSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  describe("upload", () => {
    it("doesn't finish in time: failed, nothing charged; the file is removed once the database says failed — also if it lands later", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        state.rpcAnswers.get_generated_image = [ok(failed("storage_timeout"))];
        let land!: () => void;
        state.uploadGate = new Promise<void>((resolve) => (land = resolve));
        const pending = generateImage(account("pro"), request()).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
        expect(await pending).toMatchObject({ code: "failed", status: 502, message: expect.stringMatching(/weren't charged/) });
        expect(rpcNames()).toEqual(["begin_image_generation", "fail_image_generation", "get_generated_image"]);
        expect(state.rpcs[1]!.args).toMatchObject({ p_error_code: "storage_timeout" });
        expect(state.removed).toEqual([[PATH]]);

        land(); // the upload lands after all
        await vi.advanceTimersByTimeAsync(0);
        expect(state.uploads).toHaveLength(1);
        expect(state.removed).toEqual([[PATH], [PATH]]);
        expect(rpcNames()).not.toContain("complete_image_generation");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a late upload is NOT removed when the generation isn't failed (a retry recovered it, or it can't be read)", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        state.rpcAnswers.fail_image_generation = [{ data: null, error: { message: "down" } }];
        state.rpcAnswers.get_generated_image = [{ data: null, error: { message: "down" } }, ok(succeeded)];
        let land!: () => void;
        state.uploadGate = new Promise<void>((resolve) => (land = resolve));
        const pending = generateImage(account("pro"), request()).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
        // The database couldn't be read: the client keeps its request id, the file is left alone.
        expect(await pending).toMatchObject({ code: "processing", status: 503 });
        land();
        await vi.advanceTimersByTimeAsync(0);
        expect(state.removed).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fails, but a retry recorded the image meanwhile: it is delivered — never removed", async () => {
      state.uploadError = { message: "storage hiccup" };
      state.rpcAnswers.fail_image_generation = [ok({ ok: false, image: succeeded })];
      state.rpcAnswers.get_generated_image = [ok(succeeded)];
      expect(await generateImage(account("pro"), request())).toMatchObject({ id: GEN, status: "succeeded", chargedPc: 9.7 });
      expect(state.removed).toEqual([]);
    });

    it("fails and the database says failed: nothing charged, any stored file removed", async () => {
      state.uploadError = { message: "storage down" };
      state.rpcAnswers.get_generated_image = [ok(failed("storage_failed"))];
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "failed" });
      expect(state.removed).toEqual([[PATH]]);
      expect(rpcNames()).not.toContain("complete_image_generation");
    });
  });

  describe("recording the image", () => {
    it("the completion committed but its answer was lost: the image is returned, and its file is kept", async () => {
      state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "network" } }];
      state.rpcAnswers.get_generated_image = [ok(succeeded)];
      expect(await generateImage(account("pro"), request())).toMatchObject({ id: GEN, status: "succeeded", chargedPc: 9.7 });
      expect(rpcNames()).toEqual(["begin_image_generation", "complete_image_generation", "get_generated_image"]);
      expect(state.removed).toEqual([]);
    });

    it("the completion failed and the record is still pending: this request fails it (hold given back) and removes the file", async () => {
      state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "57014" } }];
      state.rpcAnswers.get_generated_image = [ok(row({ status: "pending" })), ok(failed("settle_failed"))];
      const error = (await generateImage(account("pro"), request()).catch((e: unknown) => e)) as ImageGenerationError;
      expect(error).toMatchObject({ code: "failed", status: 502, message: expect.stringMatching(/wasn't kept.*weren't charged/) });
      expect(state.rpcs[3]!.args).toMatchObject({ p_error_code: "settle_failed", p_prompt_tokens: 12, p_output_tokens: 1120 });
      expect(state.removed).toEqual([[PATH]]);
    });

    it("…unless a retry recorded it in between: then it is delivered, not removed", async () => {
      state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "57014" } }];
      state.rpcAnswers.get_generated_image = [ok(row({ status: "pending" })), ok(succeeded)];
      state.rpcAnswers.fail_image_generation = [ok({ ok: false, image: succeeded })];
      expect(await generateImage(account("pro"), request())).toMatchObject({ id: GEN, status: "succeeded" });
      expect(state.removed).toEqual([]);
    });

    it("past the lease the database refuses it: the file is removed and the customer told they weren't charged", async () => {
      state.rpcAnswers.complete_image_generation = [ok({ ok: false, reason: "lease_expired", image: failed("lease_expired") })];
      const error = (await generateImage(account("pro"), request()).catch((e: unknown) => e)) as ImageGenerationError;
      expect(error).toMatchObject({ code: "failed", status: 502, message: expect.stringMatching(/took too long.*weren't charged/) });
      expect(rpcNames()).toEqual(["begin_image_generation", "complete_image_generation"]);
      expect(state.removed).toEqual([[PATH]]);
    });

    it("when the database can't be read at all, the file is left and the client keeps its request id", async () => {
      state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "network" } }];
      state.rpcAnswers.get_generated_image = [{ data: null, error: { message: "down" } }];
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "processing", status: 503 });
      expect(state.removed).toEqual([]);
    });
  });

  describe("a retry with the same request key", () => {
    it("still pending, its image stored but never recorded: the bytes are checked, it is recorded once and delivered", async () => {
      state.rpcAnswers.begin_image_generation = repeatOf(row({ status: "pending" }));
      state.downloads[PATH] = PNG;
      expect(await generateImage(account("pro"), request())).toMatchObject({ id: GEN, status: "succeeded", chargedPc: 9.7 });
      expect(rpcNames()).toEqual(["begin_image_generation", "complete_image_generation"]);
      expect(state.rpcs[1]!.args).toEqual({ p_user_id: USER, p_generation_id: GEN, p_mime_type: "image/png", p_size_bytes: PNG.length, p_storage_path: PATH, p_prompt_tokens: null, p_output_tokens: null });
      expect(calls).toHaveLength(0); // no second model call
      expect(state.removed).toEqual([]);
    });

    it("still pending and nothing usable stored — nothing, not an image, or an image at the wrong type's path: still being made", async () => {
      for (const stored of [{}, { [PATH]: Uint8Array.from([1, 2, 3]) }, { [`${USER}/${GEN}.jpg`]: PNG }]) {
        state.rpcs = [];
        state.downloads = stored;
        state.rpcAnswers.begin_image_generation = repeatOf(row({ status: "pending" }));
        await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "processing", status: 409 });
        expect(rpcNames()).toEqual(["begin_image_generation"]);
      }
      expect(state.removed).toEqual([]);
    });

    it("recovering it, the database is unsure: a retry never fails a generation its own request may still finish", async () => {
      state.rpcAnswers.begin_image_generation = repeatOf(row({ status: "pending" }));
      state.downloads[PATH] = PNG;
      state.rpcAnswers.complete_image_generation = [{ data: null, error: { code: "network" } }];
      state.rpcAnswers.get_generated_image = [ok(row({ status: "pending" }))];
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "processing", status: 503 });
      expect(rpcNames()).not.toContain("fail_image_generation");
      expect(state.removed).toEqual([]);
    });

    it("recovering it past the lease: refused — the file is removed, nothing charged", async () => {
      state.rpcAnswers.begin_image_generation = repeatOf(row({ status: "pending" }));
      state.downloads[PATH] = PNG;
      state.rpcAnswers.complete_image_generation = [ok({ ok: false, reason: "lease_expired", image: failed("lease_expired") })];
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ code: "failed", message: expect.stringMatching(/weren't charged/) });
      expect(state.removed).toEqual([[PATH]]);
    });

    it("failed or abandoned: any file it left is removed — and an image that succeeded is never removed", async () => {
      state.rpcAnswers.begin_image_generation = repeatOf(failed("abandoned"));
      await expect(generateImage(account("pro"), request())).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Start a new one/) });
      expect(state.removed).toEqual([ALL_PATHS]);

      state.removed = [];
      state.rpcAnswers.begin_image_generation = repeatOf(succeeded);
      await generateImage(account("pro"), request());
      expect(state.removed).toEqual([]);
    });
  });

  it("the scheduled sweep removes files only of generations the database reports failed", async () => {
    state.rpcAnswers.recover_stale_image_generations = [ok([{ user_id: USER, generation_id: GEN }])];
    state.rpcAnswers.get_generated_image = [ok(failed("abandoned"))];
    expect(await recoverStaleImageGenerations(50)).toBe(1);
    expect(state.rpcs.find((call) => call.name === "recover_stale_image_generations")!.args).toEqual({ p_limit: 50 });
    expect(state.removed).toEqual([ALL_PATHS]);

    state.removed = [];
    state.rpcAnswers.get_generated_image = [ok(succeeded)];
    await recoverStaleImageGenerations(50);
    expect(state.removed).toEqual([]);

    state.rpcAnswers.recover_stale_image_generations = [{ data: null, error: { message: "denied" } }];
    await expect(recoverStaleImageGenerations()).rejects.toThrow();
  });
});

describe("reading an image back", () => {
  it("only the account's own stored image is returned", async () => {
    state.downloads[`${USER}/${GEN}.png`] = PNG;
    state.rpcAnswers.get_generated_image = [ok(row({ status: "succeeded", mimeType: "image/png", sizeBytes: 16, storagePath: `${USER}/${GEN}.png` }))];
    expect(await readGeneratedImage(account("pro"), GEN)).toMatchObject({ mimeType: "image/png" });
    expect(state.rpcs.at(-1)).toEqual({ name: "get_generated_image", args: { p_user_id: USER, p_generation_id: GEN } });
  });

  it("someone else's, a missing one, a failed one, or a path outside the owner's folder: nothing", async () => {
    for (const answer of [ok(null), ok(row({ status: "failed" })), ok(row({ status: "succeeded", storagePath: `someone-else/${GEN}.png` }))]) {
      state.rpcAnswers.get_generated_image = [answer];
      expect(await readGeneratedImage(account("pro"), GEN)).toBeNull();
    }
    expect(await readGeneratedImage(account("pro"), "../../etc/passwd")).toBeNull();
  });
});

describe("the price shown before generating", () => {
  it("9.7 PC on a plan; Go also learns its free images left; Enterprise uses a pool unit, not PC", async () => {
    expect(await imageAllowance(account("pro"))).toMatchObject({ chargePc: 9.7, funding: "buckets", freeImagesLeft: null });
    state.rpcAnswers.get_free_images_left = [ok(2)];
    expect(await imageAllowance(account("go"))).toMatchObject({ chargePc: 9.7, funding: "free_then_credits", freeImagesLeft: 2 });
    expect(await imageAllowance(account("enterprise"))).toMatchObject({ chargePc: 0, funding: "organization" });
  });
});
