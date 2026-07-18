import type { ReasoningProviderId } from '../../reasoning/ReasoningProviderRegistry';
import type { TtsProviderId } from '../../conversation/SpeechProviderRegistry';

export const DEFAULT_PAW_ID = 'paw-default';

export type CompanionVoiceConfig = {
  ttsProvider: TtsProviderId;
  voiceId?: string;
};

export type CompanionPersonality = {
  /** Free-form traits shown in the UI, e.g. "warm", "concise", "playful". */
  traits: string[];
  reasoningProvider: ReasoningProviderId;
  systemPromptOverride?: string;
};

export type CompanionMemoryFact = {
  id: string;
  text: string;
  createdAt: number;
};

export type CompanionMemory = {
  facts: CompanionMemoryFact[];
  recentSummary?: string;
};

/** Gradually-adjusted interaction-style counters — see RelationshipEngine. */
export type CompanionRelationship = {
  interactionCount: number;
  lastInteractionAt: number | null;
  toneWeights: {
    technical: number;
    casual: number;
    supportive: number;
    encouraging: number;
  };
};

export type CompanionPreferences = {
  animationSpeed: number;
  muted: boolean;
  enableKeyboardReactions: boolean;
  enableMouseReactions: boolean;
};

export type PhotoAngle = 'front' | 'left45' | 'right45' | 'leftProfile' | 'rightProfile' | 'back' | 'fullBody';

export const QUICK_CREATE_ANGLES: PhotoAngle[] = ['front'];
export const STUDIO_CREATE_REQUIRED_ANGLES: PhotoAngle[] = [
  'front',
  'left45',
  'right45',
  'leftProfile',
  'rightProfile',
  'back',
];
export const STUDIO_CREATE_OPTIONAL_ANGLES: PhotoAngle[] = ['fullBody'];

export type CompanionPhoto = {
  angle: PhotoAngle;
  dataUrl: string;
  capturedAt: number;
  /** Result of AIRouter.validateCompanionPhoto — set once Gemini vision has checked this shot. */
  validation?: { ok: boolean; issues: string[] };
};

export type AvatarGenerationStatus = 'not-started' | 'pending' | 'ready';

/**
 * The input to a future avatar-generation pipeline: Photos → Avatar
 * Generation → Companion Skin/Mesh → existing skeleton → existing
 * animation library → existing emotion engine. Only the appearance layer
 * changes; nothing else in the runtime is touched by this. Generation
 * itself is not implemented yet — this stores everything the pipeline
 * will need once it exists, and `avatarImage` (below) doubles as a
 * cheap thumbnail derived from the front photo in the meantime.
 */
export type CompanionAvatarSource = {
  mode: 'quick' | 'studio';
  photos: CompanionPhoto[];
  generationStatus: AvatarGenerationStatus;
  /** Populated once a real generation pipeline exists — e.g. a mesh/skin asset id. Absent = not generated. */
  generatedAssetId?: string;
};

export type CompanionProfile = {
  id: string;
  name: string;
  /** References a skin — see SkinTypes. Defaults to the built-in "cat" pet definition. */
  skinId: string;
  /** Cheap thumbnail (data URL) derived from avatarSource's front photo — shown in lists/cards before real generation exists. */
  avatarImage?: string;
  /** Present once a companion was created via the Companion Lab photo flow (Quick or Studio create). */
  avatarSource?: CompanionAvatarSource;
  voice: CompanionVoiceConfig;
  personality: CompanionPersonality;
  memory: CompanionMemory;
  relationship: CompanionRelationship;
  preferences: CompanionPreferences;
  favorite: boolean;
  /** True only for the one official PawOS companion. Never deletable. */
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
};

export function createDefaultToneWeights(): CompanionRelationship['toneWeights'] {
  return { technical: 0, casual: 0, supportive: 0, encouraging: 0 };
}

export function createPawProfile(): CompanionProfile {
  const now = Date.now();
  return {
    id: DEFAULT_PAW_ID,
    name: 'Paw',
    skinId: 'cat',
    voice: { ttsProvider: 'browser' },
    personality: {
      traits: ['warm', 'helpful', 'curious'],
      reasoningProvider: 'local',
    },
    memory: { facts: [] },
    relationship: {
      interactionCount: 0,
      lastInteractionAt: null,
      toneWeights: createDefaultToneWeights(),
    },
    preferences: {
      animationSpeed: 1,
      muted: false,
      enableKeyboardReactions: true,
      enableMouseReactions: true,
    },
    favorite: true,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}
