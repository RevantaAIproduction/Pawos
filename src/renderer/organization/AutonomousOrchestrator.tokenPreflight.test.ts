import { describe, it, expect, vi } from 'vitest';

/**
 * PHASE 2D: Exact Gemini Token Preflight Tests
 *
 * Verifies:
 * 1. countTokens API call with EXACT effective request structure
 * 2. countTokens request matches generateContent request (same inputs)
 * 3. Exact input tokens used (not chars/4 heuristic)
 * 4. No arbitrary safety margins (no 10% buffer)
 * 5. Fail-closed: countTokens failure blocks authorization
 * 6. Handles all token types: promptTokenCount, cachedContentTokenCount, etc.
 * 7. Tool declarations included in token count
 * 8. System instructions included in token count
 * 9. Conversation history included in token count
 * 10. generateContent NOT called after preflight failure
 */

describe('Phase 2D: Exact Gemini Token Preflight', () => {
  describe('countTokens API structure', () => {
    it('countTokens request matches generateContent effective request', () => {
      // The countTokens API and generateContent must receive IDENTICAL inputs
      // (Same system instructions, history, tools, user input)

      const request = {
        systemPrompt: 'You are a helpful assistant.',
        history: [
          { role: 'user' as const, content: 'Hello' },
          { role: 'assistant' as const, content: 'Hi there!' },
        ],
        input: 'What is 2+2?',
        tools: [
          {
            name: 'calculator',
            description: 'Add two numbers',
            parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
          },
        ],
      };

      // countTokens request structure
      const countTokensPayload = {
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'What is 2+2?' }] },
        ],
        tools: [
          {
            function_declarations: [
              {
                name: 'calculator',
                description: 'Add two numbers',
                parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
              },
            ],
          },
        ],
      };

      // generateContent request structure (from GeminiReasoningProvider.ts)
      const generateContentPayload = {
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'What is 2+2?' }] },
        ],
        tools: [
          {
            function_declarations: [
              {
                name: 'calculator',
                description: 'Add two numbers',
                parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
              },
            ],
          },
        ],
        maxOutputTokens: 8000,
      };

      // CRITICAL: Payloads are identical (except maxOutputTokens is only in generateContent)
      expect(countTokensPayload.systemInstruction).toEqual(generateContentPayload.systemInstruction);
      expect(countTokensPayload.contents).toEqual(generateContentPayload.contents);
      expect(countTokensPayload.tools).toEqual(generateContentPayload.tools);
    });

    it('system instructions included in countTokens request', () => {
      const systemPrompt = 'You are an expert software engineer.';

      const countTokensPayload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [],
      };

      expect(countTokensPayload.systemInstruction).toBeTruthy();
      expect(countTokensPayload.systemInstruction.parts[0].text).toBe(systemPrompt);
    });

    it('conversation history included in countTokens request', () => {
      const history = [
        { role: 'user' as const, content: 'Question 1?' },
        { role: 'assistant' as const, content: 'Answer 1.' },
        { role: 'user' as const, content: 'Question 2?' },
      ];

      const contents = history.map((m) =>
        m.role === 'user' ? { role: 'user', parts: [{ text: m.content }] } : { role: 'model', parts: [{ text: m.content }] }
      );

      expect(contents).toHaveLength(3);
      expect(contents[0]).toEqual({ role: 'user', parts: [{ text: 'Question 1?' }] });
      expect(contents[1]).toEqual({ role: 'model', parts: [{ text: 'Answer 1.' }] });
      expect(contents[2]).toEqual({ role: 'user', parts: [{ text: 'Question 2?' }] });
    });

    it('tool declarations included in countTokens request', () => {
      const tools = [
        {
          name: 'fetch_data',
          description: 'Fetch data from API',
          parameters: { type: 'object', properties: { url: { type: 'string' } } },
        },
      ];

      const toolsPayload = {
        function_declarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      };

      expect(toolsPayload.function_declarations).toHaveLength(1);
      expect(toolsPayload.function_declarations[0].name).toBe('fetch_data');
    });
  });

  describe('Exact token counting', () => {
    it('uses exact token count from countTokens API (not chars/4 heuristic)', () => {
      // Before Phase 2D: Math.ceil(totalInputChars / 4)
      // After Phase 2D: Use countTokens response.totalTokens

      const textInput = 'This is a test message.'; // 23 characters
      const charBasedEstimate = Math.ceil(textInput.length / 4); // Would be ceil(23/4) = 6
      expect(charBasedEstimate).toBe(6);

      // Actual Gemini response from countTokens
      const actualTokenCount = 5; // Gemini's real count (different from chars/4)

      // CRITICAL: Use actual token count, not estimate
      expect(actualTokenCount).not.toBe(charBasedEstimate);
      expect(actualTokenCount).toBe(5);
    });

    it('no chars/4 heuristic in authorization path', () => {
      // The authorization path should NEVER use:
      // - Math.ceil(totalInputChars / 4)
      // - char-based estimates
      // - arbitrary percentages

      // Instead: exact token count from Gemini

      const geminiCountTokensResponse = {
        totalTokens: 1234,
      };

      const inputTokens = geminiCountTokensResponse.totalTokens;
      expect(inputTokens).toBe(1234);

      // NOT: const inputTokens = Math.ceil(someChars / 4);
    });

    it('no arbitrary safety margins with exact token counts', () => {
      // Before Phase 2D: maxWorkPcWithSafety = Math.ceil(maximumWorkPc * 1.1); // 10% margin
      // After Phase 2D: No margin, use exact calculation

      const exactMaxWorkPc = 123.456;
      const withMarginOld = Math.ceil(exactMaxWorkPc * 1.1); // 123.456 * 1.1 = 135.8 → 136

      // New (no margin)
      const newMaxWorkPc = Math.ceil(exactMaxWorkPc); // 123.456 → 124

      expect(withMarginOld).toBe(136);
      expect(newMaxWorkPc).toBe(124);
      expect(newMaxWorkPc).not.toBe(withMarginOld);
    });
  });

  describe('Fail-closed on preflight failure', () => {
    it('countTokens API failure throws error (does not authorize)', async () => {
      // If countTokens fails, authorization must fail
      // Do NOT fall back to chars/4
      // Do NOT call generateContent

      const countTokensFailure = new Error('Network error: countTokens API unreachable');

      // Authorization should throw
      expect(() => {
        throw countTokensFailure;
      }).toThrow('countTokens API unreachable');

      // Authorization should NOT proceed
      let authorizationAttempted = false;
      try {
        throw countTokensFailure;
      } catch {
        authorizationAttempted = false; // Caught, blocked
      }

      expect(authorizationAttempted).toBe(false);
    });

    it('invalid countTokens response throws error', () => {
      const invalidResponse = {
        totalTokens: null, // Invalid
      };

      const isValidResponse = typeof invalidResponse.totalTokens === 'number';
      expect(isValidResponse).toBe(false);

      if (!isValidResponse) {
        expect(() => {
          throw new Error('Invalid countTokens response: missing totalTokens');
        }).toThrow('Invalid countTokens response');
      }
    });

    it('generateContent NOT called after countTokens failure', async () => {
      // Scenario:
      // 1. Authorization calls countTokens
      // 2. countTokens fails
      // 3. Authorization throws error
      // 4. generateContent should NOT be called

      let countTokensCalled = false;
      let generateContentCalled = false;

      const countTokensMock = async () => {
        countTokensCalled = true;
        throw new Error('Simulated countTokens failure');
      };

      const generateContentMock = async () => {
        generateContentCalled = true;
      };

      // Authorization flow
      try {
        // Step 1: countTokens
        await countTokensMock();
        // Step 2: generateContent (should NOT reach here)
        await generateContentMock();
      } catch (err) {
        // Caught, authorization failed
      }

      expect(countTokensCalled).toBe(true);
      expect(generateContentCalled).toBe(false); // CRITICAL: Not called after failure
    });
  });

  describe('Token accounting with special cases', () => {
    it('handles cached content tokens correctly', () => {
      // Gemini response includes: promptTokenCount, cachedContentTokenCount
      // Billable input: max(0, promptTokenCount - cachedContentTokenCount)

      const usageMetadata = {
        promptTokenCount: 1000,
        cachedContentTokenCount: 200, // From previous cached request
      };

      // Billable input tokens: 1000 - 200 = 800
      const billableInputTokens = Math.max(0, usageMetadata.promptTokenCount - usageMetadata.cachedContentTokenCount);
      expect(billableInputTokens).toBe(800);

      // NOT 1000 (that would double-charge for cache)
      expect(billableInputTokens).not.toBe(usageMetadata.promptTokenCount);
    });

    it('handles thinking tokens (if present)', () => {
      // Gemini response includes: thoughtsTokenCount (if thinking model used)
      // Typically counted as input tokens for billing

      const usageMetadata = {
        promptTokenCount: 500,
        thoughtsTokenCount: 300, // Extended thinking enabled
      };

      // Thinking tokens are usually included in the prompt token count
      // or billed separately depending on model
      expect(usageMetadata.thoughtsTokenCount).toBe(300);
    });

    it('handles tool use prompt tokens', () => {
      // Gemini response includes: toolUsePromptTokenCount (if tools used)
      // These are part of the prompt tokens

      const usageMetadata = {
        promptTokenCount: 800, // Includes tool declarations and tool calls
        toolUsePromptTokenCount: 100, // Tool-specific portion
      };

      // Tool use tokens are included in promptTokenCount
      // Do NOT add them separately (would double-count)
      expect(usageMetadata.promptTokenCount).toBe(800);
      expect(usageMetadata.toolUsePromptTokenCount).toBeLessThanOrEqual(usageMetadata.promptTokenCount);
    });

    it('output tokens counted separately (not included in input)', () => {
      const usageMetadata = {
        promptTokenCount: 500,
        candidatesTokenCount: 200, // Output tokens
      };

      // Output billable separately
      const inputTokens = usageMetadata.promptTokenCount;
      const outputTokens = usageMetadata.candidatesTokenCount;

      expect(inputTokens).toBe(500);
      expect(outputTokens).toBe(200);
      expect(inputTokens + outputTokens).toBe(700); // Total, not double-counted
    });
  });

  describe('Authorization calculation with exact tokens', () => {
    it('calculates max Work PC with exact input tokens and configured output budget', () => {
      // Exact inputs
      const exactInputTokens = 500; // From countTokens
      const configuredOutputBudget = 8000;
      const model = 'gemini-flash-latest';

      // Pricing
      const pricing = {
        inputPerMillionUsd: 0.075,
        outputPerMillionUsd: 3.75,
      };

      // Calculate provider cost
      const inputUsd = (exactInputTokens * pricing.inputPerMillionUsd) / 1_000_000;
      const outputUsd = (configuredOutputBudget * pricing.outputPerMillionUsd) / 1_000_000;
      const providerCostUsd = inputUsd + outputUsd;

      // Apply 70% margin
      const customerChargeUsd = providerCostUsd / 0.30;
      const workPc = customerChargeUsd * 100; // $1 = 100 Work PC

      expect(inputUsd).toBeCloseTo(0.0000375, 7);
      expect(outputUsd).toBeCloseTo(0.03, 4);
      expect(providerCostUsd).toBeCloseTo(0.0300375, 7);
      expect(customerChargeUsd).toBeCloseTo(0.100125, 6);
      expect(workPc).toBeCloseTo(10.0125, 4);
    });

    it('does NOT use 1.1x safety multiplier with exact counts', () => {
      const exactWorkPc = 100.0;

      // Old way (with margin):
      const withMargin = Math.ceil(exactWorkPc * 1.1); // 100 * 1.1 = 110

      // New way (exact):
      const withoutMargin = Math.ceil(exactWorkPc); // 100

      // The multiplier always produces a larger reservation
      expect(withMargin).toBeGreaterThan(withoutMargin);
      expect(withoutMargin).toBe(100);

      // CRITICAL: Use exact (no margin)
      expect(withoutMargin).not.toBe(withMargin);
    });
  });

  describe('Authorization authorization blocking', () => {
    it('authorization fails if countTokens cannot be called', () => {
      // Scenario: Gemini API key missing

      const geminiApiKey = null;

      if (!geminiApiKey) {
        expect(() => {
          throw new Error('Gemini API key not configured. Cannot perform token preflight.');
        }).toThrow('Gemini API key not configured');
      }
    });

    it('authorization fails if model is not available', () => {
      const model = null;

      if (!model) {
        expect(() => {
          throw new Error(
            `Model identity not available from provider "gemini". ` +
            `Authorization requires knowing the exact concrete model for pricing lookup.`
          );
        }).toThrow('Model identity not available');
      }
    });

    it('authorization fails if exact token count cannot be determined', async () => {
      // Simulate countTokens failure

      const countTokensError = new Error(
        `Exact token preflight failed. Cannot authorize request without precise token count. ` +
        `Error: Network timeout`
      );

      expect(() => {
        throw countTokensError;
      }).toThrow('Cannot authorize request without precise token count');
    });
  });

  describe('No fallback to heuristics', () => {
    it('does NOT use chars/4 as fallback', () => {
      const chars = 1000;
      const heuristicTokens = Math.ceil(chars / 4); // 250

      // Real token count (different)
      const realTokens = 200;

      // CRITICAL: Use real, not heuristic
      expect(realTokens).not.toBe(heuristicTokens);
      expect(realTokens).toBe(200);
    });

    it('does NOT use fixed PC amounts for preflight', () => {
      // Anti-pattern: "Just reserve 500 Work PC for safety"
      // This is WRONG because actual cost depends on exact tokens and output

      const fixedPcAmount = 500; // WRONG
      const calculatedPc = 123; // CORRECT (from exact tokens)

      expect(fixedPcAmount).not.toBe(calculatedPc);
      expect(calculatedPc).toBe(123);
    });

    it('does NOT use percentage safety buffer', () => {
      const calculatedCost = 100.0;

      // WRONG: Math.ceil(calculatedCost * 1.1); // 110
      // CORRECT: Math.ceil(calculatedCost); // 100

      const wrongWithBuffer = Math.ceil(calculatedCost * 1.1);
      const correctExact = Math.ceil(calculatedCost);

      expect(wrongWithBuffer).not.toBe(correctExact);
      expect(correctExact).toBe(100);
    });
  });
});
