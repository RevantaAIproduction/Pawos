import type { ReasoningProviderId } from '../../reasoning/ReasoningProviderRegistry';
import type { TtsProviderId } from '../../conversation/SpeechProviderRegistry';

export const DEFAULT_PAW_ID = 'paw-default';

export type CompanionVoiceConfig = {
  ttsProvider: TtsProviderId;
  voiceId?: string;
  /** Real playback-speed control (0.5-2, 1 = normal) — genuinely applied for browser/openai providers; honestly ignored by providers with no speed parameter (elevenlabs/azure/kokoro/piper). */
  speed?: number;
  /** Reserved for a future provider that actually supports an emotion/style parameter — stored here but not applied by any current provider (interface-ready, same as azure/kokoro/piper). */
  emotion?: string;
};

/**
 * A named starting point for personality (friendly/professional/creative/
 * teacher/assistant) — each maps to a concrete trait bundle and a concrete
 * system-prompt addendum below (see PERSONALITY_PRESETS), not just a label.
 * 'custom' means traits/systemPromptOverride are user-authored and a preset
 * change should never silently overwrite them.
 */
export type PersonalityPreset = 'friendly' | 'professional' | 'creative' | 'teacher' | 'assistant' | 'custom';

export type CompanionPersonality = {
  preset: PersonalityPreset;
  /** Free-form traits shown in the UI, e.g. "warm", "concise", "playful". Derived from `preset` unless preset is 'custom'. */
  traits: string[];
  reasoningProvider: ReasoningProviderId;
  /** Additional free-form instruction text layered on top of the preset's own addendum. Always user-authored. */
  systemPromptOverride?: string;
};

export const PERSONALITY_PRESETS: Record<Exclude<PersonalityPreset, 'custom'>, { label: string; traits: string[]; promptAddendum: string }> = {
  friendly: {
    label: 'Friendly',
    traits: ['warm', 'encouraging', 'casual'],
    promptAddendum: 'Speak warmly and casually, like a supportive friend. Favor encouragement over correction.',
  },
  professional: {
    label: 'Professional',
    traits: ['precise', 'formal', 'efficient'],
    promptAddendum: 'Speak with a precise, professional tone. Keep replies efficient and avoid casual language.',
  },
  creative: {
    label: 'Creative',
    traits: ['imaginative', 'expressive', 'playful'],
    promptAddendum: 'Bring imaginative, expressive energy to suggestions. Favor original ideas over conventional ones when it genuinely helps.',
  },
  teacher: {
    label: 'Teacher',
    traits: ['patient', 'explanatory', 'thorough'],
    promptAddendum: 'Explain your reasoning as you go, patiently and thoroughly, as a good teacher would — never assume prior knowledge you have not confirmed.',
  },
  assistant: {
    label: 'Assistant',
    traits: ['concise', 'task-focused', 'neutral'],
    promptAddendum: 'Stay concise and task-focused. Minimize commentary and get straight to the outcome.',
  },
};

/** Builds the personality addendum text layered onto PAW_SYSTEM_PROMPT for a given profile's personality — combines the preset's own addendum (if any) with the user's own systemPromptOverride. Empty string when there's genuinely nothing to add. */
export function buildPersonalityAddendum(personality: CompanionPersonality): string {
  const parts: string[] = [];
  if (personality.preset !== 'custom') parts.push(PERSONALITY_PRESETS[personality.preset].promptAddendum);
  if (personality.systemPromptOverride?.trim()) parts.push(personality.systemPromptOverride.trim());
  return parts.join(' ');
}

export type CompanionMemoryFact = {
  id: string;
  text: string;
  createdAt: number;
};

export type CompanionMemory = {
  /** Master on/off switch for Companion Memory (goals/routines/facts). When false, the conversation layer should not call record_companion_goal/record_companion_routine for this companion. Defaults to true for profiles saved before this field existed (see migrateMemoryEnabled in CompanionProfileStore.ts). */
  enabled: boolean;
  facts: CompanionMemoryFact[];
  recentSummary?: string;
};

/**
 * Behavior — greetingStyle and idleBehavior are genuinely applied (see
 * Avatar3DOverlay.tsx and ActionController.ts's IDLE_BEHAVIOR_TUNING);
 * interactionStyle is free-form text layered into the system prompt
 * alongside personality (see buildPersonalityAddendum's caller in
 * CompanionExperience.tsx) — real, but only as an instruction to the model,
 * not a separate mechanism.
 */
export type GreetingStyle = 'enthusiastic' | 'calm' | 'silent';
export type IdleBehaviorPreset = 'active' | 'calm' | 'minimal';
export type CompanionBehavior = {
  greetingStyle: GreetingStyle;
  idleBehavior: IdleBehaviorPreset;
  interactionStyle: string;
};

export function createDefaultBehavior(): CompanionBehavior {
  return { greetingStyle: 'enthusiastic', idleBehavior: 'calm', interactionStyle: '' };
}

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

/**
 * Companion Studio is upload-first: the only real avatar source today is
 * Upload Existing Companion (see CompanionUploadPipeline.ts/
 * CompanionAnimationController's loadUploadedCompanion) — `uploadedFilePath`
 * always points at the user's original file, which is never modified;
 * `rigged` records whether the upload already had its own skeleton (true)
 * or was auto-rigged onto ours (false), set once loading actually runs.
 */
export type CompanionAvatarSource = { mode: 'upload'; uploadedFilePath: string; rigged?: boolean };

/**
 * Where a profile came from — purely descriptive, used to sort profiles into
 * the Companion Gallery's regions (Official Paw Gallery / User Library /
 * Imported Companions). 'official' is set only for isDefault:true profiles
 * today (just Paw), but the type allows more official companions to be added
 * later without a data-model change.
 */
export type CompanionOrigin = 'official' | 'lab' | 'upload' | 'imported' | 'manual';

export type CompanionProfile = {
  id: string;
  name: string;
  /** References a skin — see SkinTypes. Defaults to the built-in "cat" pet definition. */
  skinId: string;
  /** How this profile was created — see CompanionOrigin. Profiles saved before this field existed are migrated (see migrateOrigin in CompanionProfileStore.ts). */
  origin: CompanionOrigin;
  /** Thumbnail (data URL) — a rendered snapshot for uploaded companions, shown in lists/cards. */
  avatarImage?: string;
  /** Present once a companion has an uploaded 3D model. */
  avatarSource?: CompanionAvatarSource;
  voice: CompanionVoiceConfig;
  personality: CompanionPersonality;
  behavior: CompanionBehavior;
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
    origin: 'official',
    voice: { ttsProvider: 'browser' },
    personality: {
      preset: 'friendly',
      traits: ['warm', 'helpful', 'curious'],
      reasoningProvider: 'local',
    },
    behavior: createDefaultBehavior(),
    memory: { enabled: true, facts: [] },
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
