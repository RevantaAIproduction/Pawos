import type { ReasoningProviderId } from '../reasoning/ReasoningProviderRegistry';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

type ReasoningSizeTier = 'paw-flash' | 'paw-swift' | 'paw-core';

/**
 * Maps a Paw-branded reasoning tier to the concrete model string for
 * whichever underlying reasoning provider is active. Only providers with a
 * known real size lineup are listed here; a provider missing an entry (or
 * missing one of the three tiers) falls back to that provider's own default
 * model — this table only ever narrows the choice, never invents one.
 */
const REASONING_SIZE_MODELS: Partial<Record<ReasoningProviderId, Record<ReasoningSizeTier, string>>> = {
  gemini: {
    'paw-flash': 'gemini-flash-lite-latest',
    'paw-swift': 'gemini-flash-latest',
    'paw-core': 'gemini-pro-latest',
  },
  openai: {
    'paw-flash': 'gpt-4o-mini',
    'paw-swift': 'gpt-4o',
    'paw-core': 'gpt-4.1',
  },
  anthropic: {
    'paw-flash': 'claude-haiku-4-5-20251001',
    'paw-swift': 'claude-sonnet-5',
    'paw-core': 'claude-opus-4-8',
  },
};

function isReasoningSizeTier(id: PawModelId): id is ReasoningSizeTier {
  return id === 'paw-flash' || id === 'paw-swift' || id === 'paw-core';
}

/** Resolves which concrete model string to request from the active reasoning provider for a given Paw model tier. Returns undefined to mean "use the provider's own default." */
export function resolveReasoningModel(providerId: ReasoningProviderId, pawModelId: PawModelId): string | undefined {
  if (!isReasoningSizeTier(pawModelId)) return undefined;
  return REASONING_SIZE_MODELS[providerId]?.[pawModelId];
}
