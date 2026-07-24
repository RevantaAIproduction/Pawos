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
  | 'paw-creative'
  | 'paw-vision'
  | 'paw-voice'
  | 'paw-motion'
  | 'paw-memory';

export type PawModelCategory = 'reasoning' | 'creative' | 'vision' | 'voice' | 'motion' | 'memory';

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

export const DEFAULT_PAW_MODEL_ID: PawModelId = 'paw-core';

export const REASONING_PAW_MODEL_IDS: PawModelId[] = ['paw-flash', 'paw-swift', 'paw-core'];

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
    description: 'Balanced speed and reasoning quality for everyday tasks.',
    switchMessage: 'Paw Swift balances speed and reasoning quality.',
    status: 'available',
  },
  {
    id: 'paw-core',
    label: 'Paw Core',
    category: 'reasoning',
    description: 'Highest reasoning quality and largest context — the default model.',
    switchMessage: 'Paw Core provides the highest reasoning quality.',
    status: 'available',
  },
  {
    id: 'paw-creative',
    label: 'Paw Creative',
    category: 'creative',
    description: 'Image, UI, and logo generation, concept art, and design assistance.',
    switchMessage: 'Paw Creative is reserved for image and design generation — not available yet.',
    status: 'comingSoon',
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
    id: 'paw-motion',
    label: 'Paw Motion',
    category: 'motion',
    description: 'Companion motion generation — reserved for a future release.',
    switchMessage: 'Paw Motion is not available yet.',
    status: 'comingSoon',
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
