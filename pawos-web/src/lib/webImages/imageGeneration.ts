import type { AccountContext } from "../account/accountContext";
import { getRazorpayCredentials } from "../billing/razorpay";
import { createServiceClient } from "../supabase/serviceClient";
import { WebChatError } from "../webChat/errors";
import { canUseWebCapability } from "../webPolicy/webCapabilities";
import { sniffImageType } from "../webChat/uploads";
import { IMAGE_ASPECT_RATIOS, IMAGE_SIZES, MAX_IMAGE_BYTES, callImageModel, imageModel, type ImageAspectRatio, type ImageSize } from "./imageModel";

/**
 * Image generation for PawOS Web and PawOS Desktop — one flow, on the server, for both.
 *
 *   1. The account is signed in (the route checks); its plan decides what pays (fundingFor()).
 *   2. The request is checked: prompt, aspect ratio, size, and the client's request id.
 *   3. begin_image_generation() holds the price — 9.7 PC from the usage buckets, a free image on Paw
 *      Go, or one Enterprise pool unit — or refuses, before the model is called. A request id seen
 *      before returns that generation instead of starting another.
 *   4. The model is called once.
 *   5. Only real image bytes count. The image goes to private storage, then
 *      complete_image_generation() charges the hold, once. Anything else: fail_image_generation()
 *      gives the hold back and the customer is charged nothing.
 *
 * The lease (20261016000000_image_generation_recovery.sql): a generation belongs to this request
 * for IMAGE_LEASE_MS from its start, by the database's clock. Past it the database refuses the
 * completion and recovery fails the generation instead — the hold is released, an Enterprise unit
 * given back, nothing charged. This request's own budget (every database call ≤ DB_CALL_TIMEOUT_MS,
 * model ≤ 55 s, upload ≤ UPLOAD_TIMEOUT_MS) stays far inside it. A retry inside the lease recovers
 * an image that was stored but never recorded. A stored file is removed only when the database has
 * just reported its generation failed; while that can't be known, it is left and the client keeps
 * its request id.
 *
 * Amounts are never taken from the client, and the client never talks to the model.
 * See supabase/migrations/20261015000000_image_generation.sql and 20261016000000_image_generation_recovery.sql.
 */

export const GENERATED_IMAGES_BUCKET = "generated-images";
/** The customer charge for one standard 1K image: 9.7 PC (100 PC = $1, so 100 images = 970 PC). */
export const IMAGE_CHARGE_PC = 9.7;
export const FREE_IMAGES_ON_GO = 3;
export const FREE_IMAGES_USED_MESSAGE =
  "You've used your 3 free image generations. Upgrade your PawOS plan or purchase additional credits to generate more images.";
/** The database's lease on a generation (pawos_image_lease(): 5 minutes). */
export const IMAGE_LEASE_MS = 5 * 60_000;
/** The longest the upload of a generated image may take before the generation is given up. */
export const UPLOAD_TIMEOUT_MS = 30_000;
/** Every database call in the flow is bounded, so a request's whole life stays inside the lease. */
export const DB_CALL_TIMEOUT_MS = 15_000;
/** Reading back a stored image when a retry recovers it. */
export const STORAGE_READ_TIMEOUT_MS = 15_000;
const STORED_EXTENSIONS = ["png", "jpg", "webp"] as const;
const MAX_PROMPT_CHARS = 2000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export type ImageFunding = "buckets" | "free_then_credits" | "organization";

/** What pays for an image on this plan. Team members use their own seat; Enterprise its pool. */
export function fundingFor(account: Pick<AccountContext, "tier">): ImageFunding {
  if (account.tier === "pro" || account.tier === "proMax" || account.tier === "team") return "buckets";
  if (account.tier === "enterprise") return "organization";
  return "free_then_credits"; // Paw Go (and the admin-granted Build tier): three free, then credits
}

export interface ImageRequest {
  requestId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSize;
}

export function parseImageRequest(body: unknown): { ok: true; request: ImageRequest } | { ok: false; message: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : "";
  if (!REQUEST_ID_PATTERN.test(requestId)) return { ok: false, message: "A request id is required." };
  const prompt = typeof input.prompt === "string" ? input.prompt.replace(/\u0000/g, "").trim() : "";
  if (!prompt) return { ok: false, message: "Describe the image you want." };
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, message: `Describe the image in up to ${MAX_PROMPT_CHARS.toLocaleString("en-US")} characters.` };
  const aspectRatio = input.aspectRatio === undefined ? "1:1" : input.aspectRatio;
  if (typeof aspectRatio !== "string" || !(IMAGE_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) return { ok: false, message: "That aspect ratio isn't available." };
  const imageSize = input.imageSize === undefined ? "1K" : input.imageSize;
  if (typeof imageSize !== "string" || !(IMAGE_SIZES as readonly string[]).includes(imageSize)) return { ok: false, message: "Only standard (1K) images are available." };
  return { ok: true, request: { requestId, prompt, aspectRatio: aspectRatio as ImageAspectRatio, imageSize: imageSize as ImageSize } };
}

export interface GeneratedImageView {
  id: string;
  status: "succeeded";
  mimeType: string;
  sizeBytes: number;
  aspectRatio: string;
  imageSize: string;
  /** What this image cost the customer: 9.7 PC from usage, or 0 for a free or organization image. */
  chargedPc: number;
  funding: "free" | "bucket" | "organization";
  /** Where the client reads the image (signed-in, the owner only). */
  url: string;
}

/** Refusal details a client needs to offer the right next step. */
export interface ImageLimitActions {
  upgrade: boolean;
  buyCredits: boolean;
}

export class ImageGenerationError extends WebChatError {
  constructor(code: ConstructorParameters<typeof WebChatError>[0], message: string, status: number, readonly actions?: ImageLimitActions, detail?: ConstructorParameters<typeof WebChatError>[3]) {
    super(code, message, status, detail);
  }
}

type ImageRow = { id: string; status: "pending" | "succeeded" | "failed"; funding: "free" | "bucket" | "organization"; chargedPcTenths: number; mimeType: string | null; sizeBytes: number | null; storagePath: string | null; aspectRatio: string; imageSize: string; errorCode: string | null };

const view = (row: ImageRow): GeneratedImageView => ({
  id: row.id,
  status: "succeeded",
  mimeType: row.mimeType ?? "image/png",
  sizeBytes: row.sizeBytes ?? 0,
  aspectRatio: row.aspectRatio,
  imageSize: row.imageSize,
  chargedPc: row.chargedPcTenths / 10,
  funding: row.funding,
  url: `/api/web/images/${row.id}`,
});

/** Credit purchases are offered only where the payment provider is configured. */
const creditsPurchasable = () => getRazorpayCredentials() !== null;

function refusal(reason: string, funding: ImageFunding): ImageGenerationError {
  if (reason === "free_images_used") {
    return new ImageGenerationError("usage_limit_reached", FREE_IMAGES_USED_MESSAGE, 402, { upgrade: true, buyCredits: creditsPurchasable() });
  }
  if (reason === "organization_limit") {
    return new ImageGenerationError("usage_limit_reached", "Your organization's shared usage for this month has been used. It resets at the start of next month — ask your organization's administrator.", 402);
  }
  if (reason === "plan_weekly_paced") {
    return new ImageGenerationError("usage_limit_reached", "You've reached this week's usage pace for your plan. It resets soon.", 402, { upgrade: true, buyCredits: false });
  }
  if (reason === "service_unavailable") return new ImageGenerationError("model_unavailable", "Image generation isn't available right now. Please try again later.", 503);
  return new ImageGenerationError(
    "usage_limit_reached",
    funding === "free_then_credits" ? FREE_IMAGES_USED_MESSAGE : "Your plan's included usage is used up. Add usage or upgrade to keep going.",
    402,
    { upgrade: true, buyCredits: creditsPurchasable() }
  );
}

const extensionOf = (mimeType: string) => (mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png");

type ServiceClient = ReturnType<typeof createServiceClient>;
type DbResult = { data: unknown; error: { code?: string; message?: string } | null };

/** One database call, bounded by DB_CALL_TIMEOUT_MS (the abort really cancels it); never throws. */
async function callDb(service: ServiceClient, name: string, args: Record<string, unknown>): Promise<DbResult> {
  try {
    return await service.rpc(name, args).abortSignal(AbortSignal.timeout(DB_CALL_TIMEOUT_MS));
  } catch {
    return { data: null, error: { code: "unreachable" } };
  }
}

/** The generation as the database has it now, or null when that can't be read. */
async function readGeneration(service: ServiceClient, userId: string, generationId: string): Promise<ImageRow | null> {
  const found = await callDb(service, "get_generated_image", { p_user_id: userId, p_generation_id: generationId });
  return found.error ? null : ((found.data as ImageRow | null) ?? null);
}

/**
 * Removes a generation's stored file(s) — only when the database has just reported it 'failed'.
 * Failed is final and never charged, so this can never remove an image someone paid for. Best
 * effort: a failure is logged, never thrown.
 */
async function removeFilesOfFailed(service: ServiceClient, userId: string, generation: ImageRow | null, storagePath?: string): Promise<void> {
  if (generation?.status !== "failed") return;
  const paths = storagePath ? [storagePath] : STORED_EXTENSIONS.map((ext) => `${userId}/${generation.id}.${ext}`);
  try {
    const removed = await service.storage.from(GENERATED_IMAGES_BUCKET).remove(paths);
    if (removed.error) console.error("[web-images] could not remove an unused image file:", "storage error");
  } catch {
    console.error("[web-images] could not remove an unused image file:", "unreachable");
  }
}

type UploadResult = { error: { message?: string } | null };
/**
 * The upload, or a timeout after UPLOAD_TIMEOUT_MS. The SDK's upload can't be cancelled, so a
 * timed-out upload may still land: `onLateSuccess` runs if it does.
 */
async function uploadWithTimeout(upload: Promise<UploadResult>, onLateSuccess: () => void): Promise<UploadResult & { timedOut?: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ error: { message: string }; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ error: { message: "timeout" }, timedOut: true }), UPLOAD_TIMEOUT_MS);
  });
  const result = await Promise.race([upload.catch(() => ({ error: { message: "unreachable" } })), timeout]);
  clearTimeout(timer);
  if ("timedOut" in result) {
    upload.then((late) => { if (!late.error) onLateSuccess(); }, () => {});
  }
  return result;
}

const notKept = (leaseExpired: boolean) =>
  new ImageGenerationError(
    "failed",
    leaseExpired
      ? "The image took too long to finish, so it wasn't kept. Please try again. You weren't charged."
      : "The image couldn't be recorded, so it wasn't kept. Please try again. You weren't charged.",
    502
  );
const stillRecording = () =>
  new ImageGenerationError("processing", "Your image is still being recorded. Try again in a moment — you won't be charged twice.", 503);

interface StoredImage {
  path: string;
  mimeType: string;
  sizeBytes: number;
  promptTokens: number | null;
  outputTokens: number | null;
}

/**
 * Records a stored image against its generation and charges it, once (the database refuses past the
 * lease). When that can't be confirmed, it finds out what the database has before touching the
 * file: an image recorded as succeeded is returned; one recorded as failed has its file removed;
 * when nothing can be read the file stays and the client keeps its request id.
 * `owner` — this request began the generation and may fail it when it can't be recorded; a retry
 * never fails a generation its own request might still be finishing.
 */
async function recordStoredImage(service: ServiceClient, userId: string, generationId: string, stored: StoredImage, owner: boolean): Promise<GeneratedImageView> {
  const completed = await callDb(service, "complete_image_generation", {
    p_user_id: userId,
    p_generation_id: generationId,
    p_mime_type: stored.mimeType,
    p_size_bytes: stored.sizeBytes,
    p_storage_path: stored.path,
    p_prompt_tokens: stored.promptTokens,
    p_output_tokens: stored.outputTokens,
  });
  const done = completed.data as { ok?: boolean; reason?: string; image?: ImageRow } | null;
  if (!completed.error && done?.ok && done.image) return view(done.image);

  console.error("[web-images] could not settle a generated image:", completed.error?.code ?? done?.reason ?? "not settled");
  let current = !completed.error && done?.image ? done.image : await readGeneration(service, userId, generationId);
  if (current?.status === "succeeded") return view(current);
  if (current?.status === "pending" && owner) {
    await callDb(service, "fail_image_generation", { p_user_id: userId, p_generation_id: generationId, p_error_code: "settle_failed", p_prompt_tokens: stored.promptTokens, p_output_tokens: stored.outputTokens });
    current = await readGeneration(service, userId, generationId);
    if (current?.status === "succeeded") return view(current);
  }
  if (current?.status === "failed") {
    await removeFilesOfFailed(service, userId, current, stored.path);
    throw notKept(done?.reason === "lease_expired" || current.errorCode === "lease_expired" || current.errorCode === "abandoned");
  }
  throw stillRecording();
}

/**
 * A retry of a request that is still 'pending': if its image is already stored — the request that
 * made it stopped before recording it — the bytes are read back and checked (a real PNG, JPEG or
 * WebP, within the size limit, at the path for its own type), then recorded and returned. Null when
 * nothing usable is stored yet: it may still be being made.
 */
async function recoverStoredImage(service: ServiceClient, userId: string, generationId: string): Promise<GeneratedImageView | null> {
  for (const ext of STORED_EXTENSIONS) {
    const path = `${userId}/${generationId}.${ext}`;
    let bytes: Uint8Array;
    try {
      const file = await service.storage.from(GENERATED_IMAGES_BUCKET).download(path, {}, { signal: AbortSignal.timeout(STORAGE_READ_TIMEOUT_MS) });
      if (file.error || !file.data) continue;
      bytes = new Uint8Array(await file.data.arrayBuffer());
    } catch {
      continue;
    }
    const mimeType = sniffImageType(bytes);
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES || (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") || extensionOf(mimeType) !== ext) continue;
    return recordStoredImage(service, userId, generationId, { path, mimeType, sizeBytes: bytes.length, promptTokens: null, outputTokens: null }, false);
  }
  return null;
}

export async function generateImage(account: AccountContext, body: unknown): Promise<GeneratedImageView> {
  if (!canUseWebCapability(account, "web.imageGeneration")) throw new ImageGenerationError("capability_locked", "Image generation isn't included in your plan.", 403);
  const parsed = parseImageRequest(body);
  if (!parsed.ok) throw new ImageGenerationError("invalid_message", parsed.message, 400);
  const { request } = parsed;
  const funding = fundingFor(account);
  const organizationId = funding === "organization" ? (account.organizations.find((org) => org.tier === "enterprise")?.id ?? null) : null;
  if (funding === "organization" && !organizationId) throw new ImageGenerationError("usage_limit_reached", "Your organization's usage couldn't be checked. Please try again.", 503);

  const service = createServiceClient();
  const userId = account.user.id;
  const model = imageModel();

  // 3. Hold the price, or be refused — before the model is called.
  const begun = await callDb(service, "begin_image_generation", {
    p_user_id: userId,
    p_request_key: request.requestId,
    p_model: model,
    p_aspect_ratio: request.aspectRatio,
    p_image_size: request.imageSize,
    p_funding: funding,
    p_organization_id: organizationId,
  });
  if (begun.error) {
    if (/not_an_organization_member/.test(begun.error.message ?? "")) throw new ImageGenerationError("capability_locked", "Image generation needs an active organization membership.", 403);
    console.error("[web-images] could not start a generation:", begun.error.code ?? "unknown");
    throw new ImageGenerationError("usage_limit_reached", "Usage can't be confirmed right now. Please try again in a moment.", 503);
  }
  const started = begun.data as { ok?: boolean; reason?: string; repeat?: boolean; image?: ImageRow } | null;
  if (!started?.ok || !started.image) throw refusal(started?.reason ?? "no_allowance", funding);
  const row = started.image;
  if (started.repeat) {
    // The same request again: never a second generation or charge.
    if (row.status === "succeeded") return view(row);
    if (row.status === "pending") {
      // Inside its lease (the database settled it already otherwise): an image that was stored but
      // never recorded is recovered and delivered; otherwise it is still being made.
      const recovered = await recoverStoredImage(service, userId, row.id);
      if (recovered) return recovered;
      throw new ImageGenerationError("processing", "That image is still being generated.", 409);
    }
    // Failed, or abandoned past its lease: any file it left is removed — it was never charged.
    await removeFilesOfFailed(service, userId, row);
    throw new ImageGenerationError("invalid_message", "That request didn't produce an image. Start a new one.", 409);
  }

  // 4. One call to the model.
  const result = await callImageModel(request);
  const fail = async (code: string, promptTokens: number | null, outputTokens: number | null) => {
    const failed = await callDb(service, "fail_image_generation", { p_user_id: userId, p_generation_id: row.id, p_error_code: code, p_prompt_tokens: promptTokens, p_output_tokens: outputTokens });
    if (failed.error) console.error("[web-images] could not release a failed generation:", failed.error.code ?? "unknown");
  };
  if (!result.ok) {
    const { failure } = result;
    await fail(failure.kind === "unavailable" ? failure.detail : failure.kind === "not_configured" ? "not_configured" : `${failure.kind}:${failure.reason}`.toLowerCase(), result.promptTokens, result.outputTokens);
    if (failure.kind === "not_configured") throw new ImageGenerationError("not_configured", "Image generation isn't available right now.", 503);
    if (failure.kind === "refused") throw new ImageGenerationError("change_refused", "That image can't be generated. Try describing it differently. You weren't charged.", 422);
    if (failure.kind === "no_image") throw new ImageGenerationError("model_unavailable", "No image came back. Please try again. You weren't charged.", 502, undefined, "model_empty_reply");
    throw new ImageGenerationError("model_unavailable", "Paw couldn't generate the image just now. Please try again. You weren't charged.", 502, undefined, failure.detail as `model_http_${number}`);
  }

  // 5. Store it privately, then charge, once.
  const storagePath = `${userId}/${row.id}.${extensionOf(result.image.mimeType)}`;
  const uploaded = await uploadWithTimeout(
    service.storage.from(GENERATED_IMAGES_BUCKET).upload(storagePath, result.image.bytes, { contentType: result.image.mimeType, upsert: false }),
    () => void readGeneration(service, userId, row.id).then((now) => removeFilesOfFailed(service, userId, now, storagePath))
  );
  if (uploaded.error) {
    console.error("[web-images] could not store a generated image:", uploaded.timedOut ? "timeout" : "storage error");
    await fail(uploaded.timedOut ? "storage_timeout" : "storage_failed", result.image.promptTokens, result.image.outputTokens);
    const now = await readGeneration(service, userId, row.id);
    // A retry may have found the file and recorded it meanwhile: then it is this request's image.
    if (now?.status === "succeeded") return view(now);
    if (now?.status === "failed") {
      await removeFilesOfFailed(service, userId, now, storagePath);
      throw new ImageGenerationError("failed", "The image couldn't be saved. Please try again. You weren't charged.", 502);
    }
    // Not settled and can't be read: keep the request id; a retry settles it.
    throw stillRecording();
  }

  return recordStoredImage(
    service,
    userId,
    row.id,
    { path: storagePath, mimeType: result.image.mimeType, sizeBytes: result.image.bytes.length, promptTokens: result.image.promptTokens, outputTokens: result.image.outputTokens },
    true
  );
}

/**
 * Settles every account's generations that are past their lease (service role) and removes any
 * file they left. For a scheduler; nothing calls it on a request path. Returns how many it settled.
 */
export async function recoverStaleImageGenerations(limit = 100): Promise<number> {
  const service = createServiceClient();
  const swept = await callDb(service, "recover_stale_image_generations", { p_limit: limit });
  if (swept.error) throw new Error("Stale image generations couldn't be recovered.");
  const settled = (swept.data as { user_id: string; generation_id: string }[] | null) ?? [];
  for (const { user_id, generation_id } of settled) {
    await removeFilesOfFailed(service, user_id, await readGeneration(service, user_id, generation_id));
  }
  return settled.length;
}

/** The account's own image, read back for display or download. Null when it isn't theirs or doesn't exist. */
export async function readGeneratedImage(account: AccountContext, id: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const service = createServiceClient();
  const found = await service.rpc("get_generated_image", { p_user_id: account.user.id, p_generation_id: id });
  const row = found.data as ImageRow | null;
  if (found.error || !row || row.status !== "succeeded" || !row.storagePath || !row.storagePath.startsWith(`${account.user.id}/`)) return null;
  const file = await service.storage.from(GENERATED_IMAGES_BUCKET).download(row.storagePath);
  if (file.error || !file.data) return null;
  return { bytes: new Uint8Array(await file.data.arrayBuffer()), mimeType: row.mimeType ?? "image/png" };
}

/** What a client shows before generating: the price, and Go's free images left. */
export async function imageAllowance(account: AccountContext): Promise<{ chargePc: number; funding: ImageFunding; freeImagesLeft: number | null; model: string; aspectRatios: readonly string[]; imageSizes: readonly string[] }> {
  const funding = fundingFor(account);
  let freeImagesLeft: number | null = null;
  if (funding === "free_then_credits") {
    const left = await createServiceClient().rpc("get_free_images_left", { p_user_id: account.user.id });
    freeImagesLeft = typeof left.data === "number" ? left.data : null;
  }
  return { chargePc: funding === "organization" ? 0 : IMAGE_CHARGE_PC, funding, freeImagesLeft, model: imageModel(), aspectRatios: IMAGE_ASPECT_RATIOS, imageSizes: IMAGE_SIZES };
}
