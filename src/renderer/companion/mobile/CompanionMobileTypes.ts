/**
 * Reserved contract for a future PawOS mobile companion client. No mobile
 * app exists in this codebase and nothing here is transmitted anywhere —
 * pairing already works generically today (see
 * src/main/pairing/PlatformPairingStore.ts, Settings → Devices), independent
 * of any specific runtime. This type only defines the subset of a
 * CompanionProfile a paired mobile device would eventually need to render
 * and speak as the same companion, so that when a mobile client is built it
 * consumes an already-designed shape instead of prompting a data-model
 * change to CompanionProfile itself.
 *
 * Deliberately excluded: `memory` (facts/recentSummary stay desktop-local
 * unless a future sync feature is explicitly built), `avatarSource`'s
 * uploadedFilePath (a local file path, meaningless on another device), and
 * `relationship` (desktop-only interaction counters).
 */
export type CompanionMobilePayload = {
  companionId: string;
  name: string;
  skinId: string;
  avatarImage?: string;
  personality: { preset: string; traits: string[] };
  voice: { ttsProvider: string; voiceId?: string; speed?: number };
  behavior: { greetingStyle: string; idleBehavior: string };
};
