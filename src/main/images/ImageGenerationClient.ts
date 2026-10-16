import type {
  GeneratedImageInfo,
  ImageAllowanceResult,
  ImageGenerateRequest,
  ImageGenerateResult,
} from '../../shared/images/ImageGenerationTypes';
import { IMAGE_ASPECT_RATIOS } from '../../shared/images/ImageGenerationTypes';

/**
 * PawOS Desktop's side of image generation: calls the PawOS server's image endpoints (the same ones
 * PawOS Web uses) with the signed-in session as a bearer token. No model key lives in Desktop — the
 * server holds the price, the charge, the model call and the stored image.
 *
 * Generation is sent once per request id; this client never retries on its own. A request that got
 * no answer is reported as `answered: false`, and the dialog re-sends the SAME request id, which the
 * server answers with the image it already made instead of making (and charging) another.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The server's model call is capped at 55 s; this leaves room for the upload and the charge. */
export const IMAGE_GENERATE_TIMEOUT_MS = 100_000;
const IMAGE_READ_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const DEFAULT_FAILURE = "The image couldn't be generated. Please try again.";
const NO_ANSWER = "Couldn't reach PawOS. Check your connection and try again — you won't be charged twice.";

export const isImageId = (value: unknown): value is string => typeof value === 'string' && IMAGE_ID.test(value);

/** What the bytes are — never what a header claims. */
export function sniffImageBytes(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const text = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 400) : fallback);

export class ImageGenerationClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private headers(accessToken: string, json = false): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
  }

  async allowance(accessToken: string): Promise<ImageAllowanceResult> {
    if (!accessToken) return { ok: false, message: 'Sign in to PawOS to generate images.' };
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/web/images/allowance`, {
        headers: this.headers(accessToken),
        signal: AbortSignal.timeout(IMAGE_READ_TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const funding = body?.funding;
      if (
        !response.ok ||
        body?.ok !== true ||
        typeof body.chargePc !== 'number' ||
        (funding !== 'buckets' && funding !== 'free_then_credits' && funding !== 'organization')
      ) {
        return { ok: false, message: text(body?.message, "Image generation isn't available right now.") };
      }
      const freeImagesLeft = typeof body.freeImagesLeft === 'number' ? body.freeImagesLeft : null;
      return { ok: true, allowance: { chargePc: body.chargePc, funding, freeImagesLeft } };
    } catch {
      return { ok: false, message: "Couldn't reach PawOS to check the image price." };
    }
  }

  /** The stored image's bytes, for the account that made it; null if it can't be read or isn't an image. */
  async readImage(accessToken: string, id: string): Promise<{ bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | null> {
    if (!accessToken || !isImageId(id)) return null;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/web/images/${id}`, {
        headers: this.headers(accessToken),
        signal: AbortSignal.timeout(IMAGE_READ_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
      const mimeType = sniffImageBytes(bytes);
      return mimeType ? { bytes, mimeType } : null;
    } catch {
      return null;
    }
  }

  async generate(accessToken: string, request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    if (!accessToken) return { ok: false, answered: true, code: 'unauthenticated', message: 'Sign in to PawOS to generate images.' };
    const prompt = typeof request?.prompt === 'string' ? request.prompt.trim() : '';
    if (!REQUEST_ID.test(String(request?.requestId)) || !prompt || prompt.length > 2000 || !IMAGE_ASPECT_RATIOS.includes(request.aspectRatio)) {
      return { ok: false, answered: true, code: 'invalid_request', message: 'Describe the image (up to 2,000 characters) and choose an aspect ratio.' };
    }

    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/web/images/generate`, {
        method: 'POST',
        headers: this.headers(accessToken, true),
        body: JSON.stringify({ requestId: request.requestId, prompt, aspectRatio: request.aspectRatio, imageSize: '1K' }),
        signal: AbortSignal.timeout(IMAGE_GENERATE_TIMEOUT_MS),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      return { ok: false, answered: false, code: 'unreachable', message: NO_ANSWER };
    }
    // A gateway error page (no JSON) is not the server's answer: the image may still have been made,
    // so it is treated like no answer and retried with the same request id.
    if (!body) return { ok: false, answered: false, code: 'unreachable', message: NO_ANSWER };

    if (!response.ok || body.ok !== true) {
      const actions = body.actions as { upgrade?: unknown; buyCredits?: unknown } | undefined;
      return {
        ok: false,
        // "processing": this request id is still being generated — asking again with it is the way
        // to get the image, so it counts as not yet answered.
        answered: body.code !== 'processing',
        code: text(body.code, 'failed'),
        message: text(body.message, DEFAULT_FAILURE),
        ...(actions && typeof actions === 'object' ? { actions: { upgrade: actions.upgrade === true, buyCredits: actions.buyCredits === true } } : {}),
      };
    }

    const image = body.image as Record<string, unknown> | undefined;
    const funding = image?.funding;
    if (!image || !isImageId(image.id) || typeof image.chargedPc !== 'number' || (funding !== 'free' && funding !== 'bucket' && funding !== 'organization')) {
      return { ok: false, answered: true, code: 'failed', message: DEFAULT_FAILURE };
    }
    const stored = await this.readImage(accessToken, image.id);
    if (!stored || !IMAGE_TYPES.has(stored.mimeType)) {
      // Made and charged, but not readable right now: the same request id fetches it again for free.
      return { ok: false, answered: false, code: 'image_unreadable', message: "Your image was made but couldn't be loaded. Try again — you won't be charged twice." };
    }
    const info: GeneratedImageInfo = {
      id: image.id,
      chargedPc: image.chargedPc,
      funding,
      aspectRatio: typeof image.aspectRatio === 'string' ? image.aspectRatio : request.aspectRatio,
      mimeType: stored.mimeType,
      dataUrl: `data:${stored.mimeType};base64,${Buffer.from(stored.bytes).toString('base64')}`,
    };
    return { ok: true, image: info };
  }
}

export const imageFileExtension = (mimeType: string): string => (mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png');
