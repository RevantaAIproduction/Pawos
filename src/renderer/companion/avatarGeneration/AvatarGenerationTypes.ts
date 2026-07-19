/**
 * A permanently out-of-scope extension point, kept only in case a genuine
 * image-to-3D provider is deliberately added later. Confirmed by the user:
 * no image-generation model (Nano Banana or otherwise) can produce a 3D
 * mesh, so Companion Studio's canonical avatar path is upload-based only
 * (see avatar/CompanionUploadPipeline.ts and
 * CompanionAnimationController.loadUploadedCompanion — Upload -> Validate ->
 * Detect Rig -> Auto Rig (if needed) -> Companion Runtime). Nothing in the
 * current user experience references this interface; it exists purely so a
 * real provider could be wired in later without a data-model change.
 */
export type AvatarGenerationResult =
  | { ok: true; meshAssetId: string }
  | { ok: false; reason: 'not-configured' | 'failed'; message: string };

/**
 * A modular, provider-agnostic connector for turning source images into a
 * real mesh/skin asset id. No implementation exists for any provider and
 * none is planned — this interface is reserved architecture only.
 */
export interface AvatarGenerationConnector {
  id: string;
  displayName: string;
  isConfigured(): boolean;
  generateAvatar(input: { sourceImages: string[] }): Promise<AvatarGenerationResult>;
}
