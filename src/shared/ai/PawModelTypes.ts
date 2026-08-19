/**
 * Paw-branded AI model catalog. This is the only model identity ever shown
 * to a user or written into a system prompt — the real underlying provider
 * (Gemini, OpenAI, Anthropic, local, etc. — see ReasoningProviderRegistry)
 * stays an internal implementation detail behind PawModelRegistry. Switching
 * a PawModelId is always an explicit user action; nothing here ever changes
 * automatically.
 */
export type PawModelId =
  | 'paw-flash'
  | 'paw-swift'
  | 'paw-core'
  | 'paw-fable'
  | 'paw-vision'
  | 'paw-voice'
  | 'paw-memory';

export type PawModelCategory = 'reasoning' | 'vision' | 'voice' | 'memory';

export type PawModelStatus = 'available' | 'comingSoon';

export type PawModelDescriptor = {
  id: PawModelId;
  label: string;
  category: PawModelCategory;
  description: string;
  /** Shown as an informational note when the user switches to this model — never a blocking dialog. */
  switchMessage: string;
  status: PawModelStatus;
};

/**
 * Paw Swift, not Paw Core — deliberately not the highest/most expensive reasoning model.
 * Defaulting to Paw Core (which maps to each provider's top-line model — see
 * PawModelRegistry.ts's REASONING_SIZE_MODELS, e.g. claude-opus-4-8/gpt-4.1/gemini-pro-latest)
 * would burn a new user's Paw Compute allowance fastest for turns that rarely need it. Paw Swift
 * is the balanced mid-tier model (see its description below) — the same role Sonnet, not Opus,
 * plays as Claude Code's own default. Selecting Paw Core remains one click away and is never
 * blocked for any entitled tier; it is simply never chosen automatically.
 */
export const DEFAULT_PAW_MODEL_ID: PawModelId = 'paw-swift';

/**
 * Fable answers turns exactly like Flash/Swift/Core do (same selectable "Reasoning models" group,
 * same reasoning provider plumbing) — what's different is billing, not reasoning capability. It
 * always draws from purchased Paw Credits and never the plan's included Paw Compute allowance (see
 * EntitlementService.hasCreditsRemaining()/CreditStore's fableUsedThisPeriod counter) — callers that
 * need to special-case that billing behavior check identity against PAW_FABLE_MODEL_ID directly,
 * never by excluding it from REASONING_PAW_MODEL_IDS (which stays about UI selectability only).
 */
export const PAW_FABLE_MODEL_ID: PawModelId = 'paw-fable';

export const REASONING_PAW_MODEL_IDS: PawModelId[] = ['paw-flash', 'paw-swift', 'paw-core', 'paw-fable'];

export const PAW_MODEL_CATALOG: PawModelDescriptor[] = [
  {
    id: 'paw-flash',
    label: 'Paw Flash',
    category: 'reasoning',
    description: 'Fastest and cheapest — smaller context, best for quick questions.',
    switchMessage: 'Paw Flash is faster but may produce shorter responses.',
    status: 'available',
  },
  {
    id: 'paw-swift',
    label: 'Paw Swift',
    category: 'reasoning',
    description: 'Balanced speed and reasoning quality for everyday tasks — the default model.',
    switchMessage: 'Paw Swift balances speed and reasoning quality.',
    status: 'available',
  },
  {
    id: 'paw-core',
    label: 'Paw Core',
    category: 'reasoning',
    description: 'Highest reasoning quality and largest context — uses more Paw Compute per turn.',
    switchMessage: 'Paw Core provides the highest reasoning quality, but uses more Paw Compute per turn.',
    status: 'available',
  },
  {
    id: 'paw-fable',
    label: 'Paw Fable',
    category: 'reasoning',
    description: "Paw's own dedicated model — always runs on your purchased Paw Credits, never your plan's included Paw Compute allowance.",
    switchMessage: "Paw Fable always spends Paw Credits, never your plan's included Paw Compute — it needs a real Paw Credits balance to answer.",
    status: 'available',
  },
  {
    id: 'paw-vision',
    label: 'Paw Vision',
    category: 'vision',
    description: 'Image understanding — OCR, screenshots, and document analysis.',
    switchMessage: 'Paw Vision reads and understands images and documents.',
    status: 'available',
  },
  {
    id: 'paw-voice',
    label: 'Paw Voice',
    category: 'voice',
    description: 'Speech conversations — text-to-speech and speech-to-text.',
    switchMessage: 'Paw Voice powers spoken conversations.',
    status: 'available',
  },
  {
    id: 'paw-memory',
    label: 'Paw Memory',
    category: 'memory',
    description: 'Long-term recall across your conversations, projects, and work.',
    switchMessage: 'Paw Memory recalls context from past conversations and work.',
    status: 'available',
  },
];

export function getPawModel(id: PawModelId): PawModelDescriptor {
  return PAW_MODEL_CATALOG.find((m) => m.id === id) ?? PAW_MODEL_CATALOG.find((m) => m.id === DEFAULT_PAW_MODEL_ID)!;
}

export function isReasoningPawModel(id: PawModelId): boolean {
  return REASONING_PAW_MODEL_IDS.includes(id);
}
