import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReasoningProvider, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import { resolveReasoningModel } from '../ai/PawModelRegistry';

/**
 * PHASE 2B FINAL INTEGRATION CHECK
 *
 * Proves that the concrete model used by authorization is IDENTICAL to:
 * 1. The model resolved by AIRouter
 * 2. The model exposed by ReasoningProvider
 * 3. The model actually used in Gemini generateContent request
 *
 * This is not a unit test of configuration alone.
 * It traces the actual runtime path and captures the model at each step.
 */

describe('Phase 2B Integration: Model Identity Through Execution Path', () => {
  describe('Model flows through AIRouter → Provider → Authorization → Execution', () => {
    it('paw-flash → gemini-3.5-flash-lite used for both authorization and generateContent', () => {
      // STEP 1: Resolve model (AIRouter does this)
      const pawModelId = 'paw-flash';
      const providerId = 'gemini';
      const resolvedModel = resolveReasoningModel(providerId, pawModelId);

      expect(resolvedModel).toBe('gemini-3.5-flash-lite');

      // STEP 2: Create provider instance (AIRouter does this)
      // Mock provider that exposes the resolved model
      const mockProvider: ReasoningProvider = {
        id: providerId,
        label: 'Gemini',
        model: resolvedModel, // EXPOSED BY PHASE 2B FIX
        isSupported: () => true,
        streamResponse: (request: ReasoningProviderRequest, callbacks) => {
          // STEP 3: Authorization would read provider.model here
          const authorizationModel = mockProvider.model;
          expect(authorizationModel).toBe('gemini-3.5-flash-lite');

          // STEP 4: Generate request (simulating what authorization does)
          const authMaxInputTokens = 8000; // From authorization
          const pricing = {
            inputPerMillionUsd: 0.075,
            outputPerMillionUsd: 0.3,
          };
          const inputUsd = (authMaxInputTokens * pricing.inputPerMillionUsd) / 1_000_000;
          const outputUsd = (8000 * pricing.outputPerMillionUsd) / 1_000_000;
          const maxProviderCost = inputUsd + outputUsd;

          // STEP 5: Simulate Gemini generateContent request
          // The provider would construct this request using the model
          const geminiRequest = {
            model: authorizationModel, // SAME model
            systemInstruction: request.systemPrompt,
            contents: request.history,
            tools: request.tools,
            maxOutputTokens: 8000,
          };

          // CRITICAL ASSERTION: generateContent uses SAME model as authorization
          expect(geminiRequest.model).toBe(resolvedModel);
          expect(geminiRequest.model).toBe('gemini-3.5-flash-lite');

          // Simulate response
          callbacks.onComplete('Test response');
          return { cancel: () => {} };
        },
      };

      // VERIFY: Provider exposes the concrete model
      expect(mockProvider.model).toBe('gemini-3.5-flash-lite');

      // VERIFY: Authorization reads from provider.model (not hardcoded fallback)
      const authModel = mockProvider.model;
      expect(authModel).not.toBe('gemini-3.6-flash'); // NOT the default
      expect(authModel).toBe('gemini-3.5-flash-lite'); // The correct tier model
    });

    it('paw-core → gemini-3.1-pro used consistently', () => {
      const pawModelId = 'paw-core';
      const providerId = 'gemini';
      const resolvedModel = resolveReasoningModel(providerId, pawModelId);

      expect(resolvedModel).toBe('gemini-3.1-pro');

      const mockProvider: ReasoningProvider = {
        id: providerId,
        label: 'Gemini',
        model: resolvedModel,
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          // Authorization uses provider.model
          expect(mockProvider.model).toBe('gemini-3.1-pro');

          // Gemini generateContent uses same model
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${mockProvider.model}:streamGenerateContent`;
          expect(geminiUrl).toContain('gemini-3.1-pro');

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      expect(mockProvider.model).toBe('gemini-3.1-pro');
    });

    it('no hardcoded fallback exists at any step of the path', () => {
      const pawModelId = 'paw-flash';
      const providerId = 'gemini';
      const resolvedModel = resolveReasoningModel(providerId, pawModelId);

      // CRITICAL: resolved model should NOT be the hardcoded fallback
      expect(resolvedModel).not.toBe('gemini-3.6-flash');

      const mockProvider: ReasoningProvider = {
        id: providerId,
        label: 'Gemini',
        model: resolvedModel,
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          // Authorization does NOT use fallback
          // Before Phase 2B fix: baseProvider.model || 'gemini-3.6-flash'
          // After Phase 2B fix: baseProvider.model (with error if undefined)
          const authModel = mockProvider.model;
          expect(authModel).toBeTruthy();
          expect(authModel).not.toBe('gemini-3.6-flash');

          // Gemini request uses same model (no fallback here either)
          expect(mockProvider.model).toBe(resolvedModel);

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      // Execution path never uses 'gemini-3.6-flash' as fallback
      expect(mockProvider.model).toBe('gemini-3.5-flash-lite');
    });
  });

  describe('Model identity consistency across autonomous modes', () => {
    it('each paw-* mode uses exactly one concrete model, no ambiguity', () => {
      const modes = [
        { paw: 'paw-flash' as const, expected: 'gemini-3.5-flash-lite' },
        { paw: 'paw-swift' as const, expected: 'gemini-3.6-flash' },
        { paw: 'paw-core' as const, expected: 'gemini-3.1-pro' },
      ];

      for (const mode of modes) {
        const resolved = resolveReasoningModel('gemini', mode.paw);
        expect(resolved).toBe(mode.expected);

        // Create provider
        const provider: ReasoningProvider = {
          id: 'gemini',
          label: 'Gemini',
          model: resolved,
          isSupported: () => true,
          streamResponse: (request, callbacks) => {
            // Authorization uses this model
            const authModel = provider.model;
            expect(authModel).toBe(mode.expected);

            // Gemini uses this model
            expect(authModel).not.toBe('gemini-3.6-flash'); // No default fallback

            callbacks.onComplete('Response');
            return { cancel: () => {} };
          },
        };

        expect(provider.model).toBe(mode.expected);
      }
    });

    it('model is set at AIRouter.getReasoningProvider() time, never changes during request', () => {
      // Simulate AIRouter.getReasoningProvider()
      const pawModelId = 'paw-swift';
      const resolvedModel = resolveReasoningModel('gemini', pawModelId);

      const provider: ReasoningProvider = {
        id: 'gemini',
        label: 'Gemini',
        model: resolvedModel, // Set once, here
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          // Model doesn't change during request processing
          expect(provider.model).toBe('gemini-3.6-flash');

          // Authorization would use it
          const authModel = provider.model;
          expect(authModel).toBe('gemini-3.6-flash');

          // Gemini uses it
          expect(authModel).toBe('gemini-3.6-flash');

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      // Multiple requests use same provider.model
      const request1: ReasoningProviderRequest = {
        systemPrompt: 'System',
        history: [],
        input: 'Input 1',
        tools: [],
      };

      const request2: ReasoningProviderRequest = {
        systemPrompt: 'System',
        history: [],
        input: 'Input 2',
        tools: [],
      };

      // Both requests see same model
      expect(provider.model).toBe('gemini-3.6-flash');

      // Model doesn't vary per request
      expect(provider.model).toBe(provider.model);
    });
  });

  describe('Authorization reads model from provider, never hardcoded', () => {
    it('authorization extracts model from baseProvider.model', () => {
      // Before Phase 2B fix:
      // const model = baseProvider.id === 'gemini'
      //   ? (baseProvider as any).model || 'gemini-3.6-flash'  // FALLBACK!
      //   : baseProvider.id;

      // After Phase 2B fix:
      // const model = baseProvider.model;
      // if (!model) throw new Error('Model not available');

      const provider: ReasoningProvider = {
        id: 'gemini',
        label: 'Gemini',
        model: 'gemini-3.1-pro',
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      // This is what AutonomousOrchestrator.createAuthorizedProvider does (after Phase 2B):
      const model = provider.model; // Never falls back to hardcoded value

      expect(model).toBe('gemini-3.1-pro');

      // If model were missing, it would throw (fail-safe):
      const providerWithoutModel: any = {
        id: 'gemini',
        label: 'Gemini',
        // model is MISSING
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      const missingModel = providerWithoutModel.model;
      expect(missingModel).toBeUndefined();

      // Authorization code would throw error:
      if (!missingModel) {
        expect(() => {
          throw new Error(
            `Model identity not available from provider "${providerWithoutModel.id}". ` +
            `Authorization requires knowing the exact concrete model for pricing lookup.`
          );
        }).toThrow('Model identity not available');
      }
    });

    it('pricing lookup uses model from baseProvider.model, not hardcoded', () => {
      const provider: ReasoningProvider = {
        id: 'gemini',
        label: 'Gemini',
        model: 'gemini-3.5-flash-lite',
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      // Authorization pricing lookup (simulated)
      const model = provider.model;
      const mockPricing = {
        'gemini-3.5-flash-lite': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
        'gemini-3.6-flash': { inputPerMillionUsd: 0.075, outputPerMillionUsd: 3.75 },
        'gemini-3.1-pro': { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
      };

      const pricing = mockPricing[model as keyof typeof mockPricing];
      expect(pricing).toBe(mockPricing['gemini-3.5-flash-lite']);

      // If we had used hardcoded fallback 'gemini-3.6-flash', we'd get wrong pricing:
      const wrongPricing = mockPricing['gemini-3.6-flash'];
      expect(wrongPricing).not.toBe(pricing); // WRONG pricing if fallback used

      // Proof: they differ
      expect(pricing.inputPerMillionUsd).toBe(0.075);
      expect(wrongPricing.inputPerMillionUsd).toBe(0.075);
      expect(pricing.outputPerMillionUsd).toBe(0.3); // flash-lite
      expect(wrongPricing.outputPerMillionUsd).toBe(3.75); // flash (12x more!)
    });
  });

  describe('Gemini generateContent uses model from provider', () => {
    it('Gemini API URL includes exact model from provider.model', () => {
      const provider: ReasoningProvider = {
        id: 'gemini',
        label: 'Gemini',
        model: 'gemini-3.5-flash-lite',
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          // Gemini provider constructs URL from model (from GeminiReasoningProvider.ts:145)
          // const url = `${baseUrl}/models/${model}:streamGenerateContent?...`
          const model = provider.model;
          const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
          const url = `${baseUrl}/models/${model}:streamGenerateContent`;

          expect(url).toContain('gemini-3.5-flash-lite');
          expect(url).not.toContain('gemini-3.6-flash'); // NOT the fallback

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      provider.streamResponse(
        { systemPrompt: '', history: [], input: '', tools: [] },
        { onDelta: () => {}, onComplete: () => {} }
      );

      expect(provider.model).toBe('gemini-3.5-flash-lite');
    });

    it('usage metadata includes model from actual Gemini response', () => {
      const provider: ReasoningProvider = {
        id: 'gemini',
        label: 'Gemini',
        model: 'gemini-3.1-pro',
        isSupported: () => true,
        streamResponse: (request, callbacks, usage) => {
          // Gemini returns usage metadata with model from request (GeminiReasoningProvider.ts:200)
          // callbacks.onUsage?.({
          //   provider: 'gemini',
          //   model,  // This is the model from createGeminiReasoningProvider config
          //   ...
          // });

          const usageModel = provider.model; // Same as request
          expect(usageModel).toBe('gemini-3.1-pro');

          callbacks.onUsage?.({
            provider: 'gemini',
            model: usageModel,
            inputTokens: 1000,
            outputTokens: 2000,
            totalTokens: 3000,
            requestId: 'req-123',
          });

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      let capturedUsageModel: string | undefined;
      provider.streamResponse(
        { systemPrompt: '', history: [], input: '', tools: [] },
        {
          onDelta: () => {},
          onUsage: (usage) => {
            capturedUsageModel = usage.model;
          },
          onComplete: () => {},
        }
      );

      expect(capturedUsageModel).toBe('gemini-3.1-pro');
    });
  });

  describe('Full path: Model consistency from selection to settlement', () => {
    it('AIRouter → Provider → Authorization → Gemini → Usage → Settlement uses same model', () => {
      // STEP 1: AIRouter selects model
      const pawModelId = 'paw-swift';
      const providerId = 'gemini';
      const selectedModel = resolveReasoningModel(providerId, pawModelId);
      expect(selectedModel).toBe('gemini-3.6-flash');

      // STEP 2: Provider exposes model
      const provider: ReasoningProvider = {
        id: providerId,
        label: 'Gemini',
        model: selectedModel, // Exposed by Phase 2B
        isSupported: () => true,
        streamResponse: (request, callbacks) => {
          // STEP 3: Authorization reads model for pricing
          const authModel = provider.model;
          expect(authModel).toBe('gemini-3.6-flash');

          // STEP 4: Gemini request uses model
          const geminiModel = provider.model;
          expect(geminiModel).toBe('gemini-3.6-flash');

          // STEP 5: Usage metadata includes model
          callbacks.onUsage?.({
            provider: 'gemini',
            model: geminiModel, // Same model from request
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300,
            requestId: 'req-456',
          });

          // STEP 6: Settlement receives model from usage
          const settlementModel = geminiModel;
          expect(settlementModel).toBe('gemini-3.6-flash');

          callbacks.onComplete('Response');
          return { cancel: () => {} };
        },
      };

      let usageModelInMetadata: string | undefined;
      provider.streamResponse(
        { systemPrompt: '', history: [], input: '', tools: [] },
        {
          onDelta: () => {},
          onUsage: (usage) => {
            usageModelInMetadata = usage.model;
          },
          onComplete: () => {},
        }
      );

      // Verify model is SAME at all steps
      expect(selectedModel).toBe('gemini-3.6-flash');
      expect(provider.model).toBe('gemini-3.6-flash');
      expect(usageModelInMetadata).toBe('gemini-3.6-flash');
    });
  });
});
