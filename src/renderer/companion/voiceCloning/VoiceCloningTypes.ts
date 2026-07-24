/**
 * A modular, provider-agnostic extension point for real voice cloning
 * (training a synthetic voice from an uploaded sample) — the same
 * reserved-but-unimplemented shape as AvatarGenerationTypes.ts. No
 * implementation exists for any provider today (ElevenLabs, Cartesia,
 * PlayHT, OpenAI, Azure AI Speech, etc. could each register one later)
 * — this interface exists so the UI can be built honestly now, without
 * pretending an upload is training a voice when nothing is configured.
 */
export type VoiceCloningResult =
  | { ok: true; voiceId: string }
  | { ok: false; reason: 'not-configured' | 'failed'; message: string };

export interface VoiceCloningProvider {
  id: string;
  displayName: string;
  isConfigured(): boolean;
  /** `consentGiven` must be true before any provider is ever called — enforced by the caller (VoiceCloningSection), not just documented here. */
  cloneVoice(input: { sampleAudio: Blob; consentGiven: boolean }): Promise<VoiceCloningResult>;
}
