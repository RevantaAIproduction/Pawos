import { sniffImageType } from "../webChat/uploads";

/**
 * The image model call — server side only. The key comes from the server's environment (the same
 * GEMINI_API_KEY as chat) and goes in a request header, never in a URL, a log or a response.
 *
 * One call, never retried here: every successful call is a paid image, so a retry is decided by the
 * caller's request id (lib/webImages/imageGeneration.ts), not by this adapter.
 */

/** Configurable on the server; one setting for PawOS Web and PawOS Desktop alike. */
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
export function imageModel(): string {
  const configured = process.env.WEB_IMAGE_MODEL?.trim();
  return configured && /^[a-z0-9][a-z0-9.-]{2,80}$/.test(configured) ? configured : DEFAULT_IMAGE_MODEL;
}

/** The aspect ratios the model accepts at 1K (Google's documentation for the Flash Lite image model). */
export const IMAGE_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
/** Standard images only, for now. */
export const IMAGE_SIZES = ["1K"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export const IMAGE_CALL_TIMEOUT_MS = 55_000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function modelBaseUrl(): string {
  // The local browser tests point the dev server at a stub; ignored in production builds.
  const override = process.env.WEB_CHAT_MODEL_BASE_URL;
  return override && process.env.NODE_ENV !== "production" ? override : GEMINI_BASE_URL;
}

export type ImageModelFailure =
  /** No key on this server. */
  | { kind: "not_configured" }
  /** The provider refused the prompt or the picture (its safety filters). Nothing was made. */
  | { kind: "refused"; reason: string }
  /** The provider answered without a usable image. */
  | { kind: "no_image"; reason: string }
  /** The provider could not be reached, or said it was busy or failed. */
  | { kind: "unavailable"; detail: string };

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  promptTokens: number | null;
  outputTokens: number | null;
}

export type ImageModelResult = { ok: true; image: GeneratedImage } | { ok: false; failure: ImageModelFailure; promptTokens: number | null; outputTokens: number | null };

/** A provider's fixed reason word (IMAGE_SAFETY, NO_IMAGE, …); never its free text. */
const reasonWord = (value: unknown): string => (typeof value === "string" && /^[A-Z_]{2,40}$/.test(value) ? value : "UNKNOWN");
const SAFETY_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_RECITATION"]);

type GeminiPart = { text?: string; thought?: boolean; inlineData?: { mimeType?: string; data?: string } };
type GeminiAnswer = {
  candidates?: { finishReason?: string; content?: { parts?: GeminiPart[] } }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/** Reads the provider's answer: the generated image (not a draft "thought" image), or why there is none. */
export function readImageAnswer(body: GeminiAnswer): ImageModelResult {
  const promptTokens = typeof body.usageMetadata?.promptTokenCount === "number" ? body.usageMetadata.promptTokenCount : null;
  const outputTokens = typeof body.usageMetadata?.candidatesTokenCount === "number" ? body.usageMetadata.candidatesTokenCount : null;
  const fail = (failure: ImageModelFailure): ImageModelResult => ({ ok: false, failure, promptTokens, outputTokens });

  if (body.promptFeedback?.blockReason) return fail({ kind: "refused", reason: reasonWord(body.promptFeedback.blockReason) });
  const candidate = body.candidates?.[0];
  if (!candidate) return fail({ kind: "no_image", reason: "NO_CANDIDATE" });
  const finish = reasonWord(candidate.finishReason);

  // The final image is the last image part that is not a "thought" (a draft the model may show first).
  const images = (candidate.content?.parts ?? []).filter((part) => part.inlineData?.data && part.thought !== true);
  const last = images.at(-1);
  if (!last?.inlineData?.data) {
    return fail(SAFETY_REASONS.has(finish) ? { kind: "refused", reason: finish } : { kind: "no_image", reason: finish === "UNKNOWN" ? "NO_IMAGE" : finish });
  }
  const bytes = Uint8Array.from(Buffer.from(last.inlineData.data, "base64"));
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return fail({ kind: "no_image", reason: bytes.length === 0 ? "EMPTY_IMAGE" : "IMAGE_TOO_LARGE" });
  // What the bytes are, not what the answer claims they are; only these three types are kept.
  const sniffed = sniffImageType(bytes);
  if (sniffed !== "image/png" && sniffed !== "image/jpeg" && sniffed !== "image/webp") return fail({ kind: "no_image", reason: "NOT_AN_IMAGE" });
  return { ok: true, image: { bytes, mimeType: sniffed, promptTokens, outputTokens } };
}

export async function callImageModel(request: { prompt: string; aspectRatio: ImageAspectRatio; imageSize: ImageSize }): Promise<ImageModelResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, failure: { kind: "not_configured" }, promptTokens: null, outputTokens: null };
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${modelBaseUrl()}/models/${imageModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: request.aspectRatio, imageSize: request.imageSize },
        },
      }),
      signal: AbortSignal.timeout(IMAGE_CALL_TIMEOUT_MS),
    });
  } catch {
    console.error(`[web-images] image model call got no answer after ${Date.now() - started}ms`);
    return { ok: false, failure: { kind: "unavailable", detail: "model_timeout" }, promptTokens: null, outputTokens: null };
  }
  if (!response.ok) {
    const providerStatus = await response
      .json()
      .then((body: { error?: { status?: unknown } }) => (typeof body?.error?.status === "string" && /^[A-Z_]{3,40}$/.test(body.error.status) ? ` ${body.error.status}` : ""))
      .catch(() => "");
    console.error(`[web-images] image model call failed: HTTP ${response.status}${providerStatus} after ${Date.now() - started}ms`);
    return { ok: false, failure: { kind: "unavailable", detail: `model_http_${response.status}` }, promptTokens: null, outputTokens: null };
  }
  const body = (await response.json().catch(() => ({}))) as GeminiAnswer;
  const result = readImageAnswer(body);
  if (!result.ok) console.error(`[web-images] no image: ${result.failure.kind}${"reason" in result.failure ? ` ${result.failure.reason}` : ""} after ${Date.now() - started}ms`);
  return result;
}
