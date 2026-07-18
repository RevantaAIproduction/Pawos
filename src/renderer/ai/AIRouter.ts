import { aiProviderConfigStore } from './AIProviderConfigStore';
import {
  createReasoningProvider,
  REASONING_PROVIDER_CATALOG,
  type ReasoningProviderId,
} from '../reasoning/ReasoningProviderRegistry';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';
import { analyzeCompanionPhoto, type PhotoValidationResult } from './GeminiVision';
import {
  classifySessionContinuation,
  type SessionContinuationCandidate,
  type SessionContinuationDecision,
} from './SessionClassifier';

/**
 * The single entry point for AI capability in PawOS. The UI, the
 * Companion Lab, and the conversation runtime call methods here — never a
 * specific provider (Gemini, OpenAI, etc.) directly. Which provider
 * actually serves a request is an internal, swappable config decision
 * (see AIProviderConfigStore) — Paw never exposes the underlying provider.
 */
export class AIRouter {
  getReasoningProvider(): ReasoningProvider {
    const config = aiProviderConfigStore.get();
    return createReasoningProvider({
      id: config.activeProviderId,
      apiKey: config.apiKeys[config.activeProviderId],
      model: config.models[config.activeProviderId],
    });
  }

  getActiveProviderId(): ReasoningProviderId {
    return aiProviderConfigStore.get().activeProviderId;
  }

  isConfigured(providerId: ReasoningProviderId): boolean {
    const entry = REASONING_PROVIDER_CATALOG.find((p) => p.id === providerId);
    if (!entry) return false;
    if (!entry.requiresApiKey) return true;
    return Boolean(aiProviderConfigStore.getApiKey(providerId));
  }

  /**
   * Vision analysis for the Companion Lab capture flow. Internally uses
   * Gemini (the only vision-capable provider configured today) regardless
   * of which provider is active for chat — callers never know that.
   */
  async validateCompanionPhoto(imageDataUrl: string, expectedAngle: string): Promise<PhotoValidationResult> {
    const apiKey = aiProviderConfigStore.getApiKey('gemini');
    if (!apiKey) {
      return {
        ok: true,
        detectedAngle: expectedAngle,
        issues: ["Photo validation isn't available right now — skipped for this photo."],
      };
    }
    return analyzeCompanionPhoto({ apiKey, imageDataUrl, expectedAngle });
  }

  /**
   * "Automatic Session Detection" — decides whether a new message continues
   * one of the user's recent conversation sessions or starts a fresh one.
   * Same internal-Gemini-regardless-of-active-provider pattern as
   * validateCompanionPhoto; if no key is configured, the caller falls back
   * to the session store's own time-based heuristic rather than blocking.
   */
  async classifySessionContinuation(
    transcript: string,
    candidates: SessionContinuationCandidate[]
  ): Promise<SessionContinuationDecision> {
    const apiKey = aiProviderConfigStore.getApiKey('gemini');
    if (!apiKey) return { action: 'new', sessionId: null };
    return classifySessionContinuation({ apiKey, transcript, candidates });
  }
}

export const aiRouter = new AIRouter();
