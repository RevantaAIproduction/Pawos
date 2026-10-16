/**
 * Image generation, as PawOS Desktop sees it. Everything that matters is decided by the PawOS server
 * (pawos-web /api/web/images/*): the price, whether the account can pay, the model call and where the
 * image is kept. Desktop holds no model key; it calls the same endpoint as PawOS Web with the
 * signed-in session.
 */

export const IMAGE_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9'] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export interface ImageAllowance {
  /** The PC one image costs (9.7) — shown for bucket and credit funding. */
  chargePc: number;
  funding: 'buckets' | 'free_then_credits' | 'organization';
  /** Paw Go's free images left (of 3); null for other tiers. */
  freeImagesLeft: number | null;
}

export interface GeneratedImageInfo {
  id: string;
  chargedPc: number;
  funding: 'free' | 'bucket' | 'organization';
  aspectRatio: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** The image itself, as a data: URL, so the renderer can show it without the session token. */
  dataUrl: string;
}

export interface ImageFailureActions {
  upgrade: boolean;
  buyCredits: boolean;
}

export type ImageAllowanceResult = { ok: true; allowance: ImageAllowance } | { ok: false; message: string };

export type ImageGenerateResult =
  | { ok: true; image: GeneratedImageInfo }
  /**
   * `answered` is false when the server never answered (network, timeout): the caller retries with
   * the SAME requestId, so a retry can never make — or charge — a second image.
   */
  | { ok: false; answered: boolean; code: string; message: string; actions?: ImageFailureActions };

export type ImageSaveResult = { ok: true; filePath: string } | { ok: false; canceled: boolean; message?: string };

export interface ImageGenerateRequest {
  requestId: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
}
