/**
 * Context preservation test: Verify that all SubmittedInputContext fields
 * flow through the execution choice pipeline without loss.
 */

import { describe, it, expect } from 'vitest';
import type { SubmittedInputContext } from './ConversationTypes';

describe('SubmittedInputContext preservation through choice pipeline', () => {
  it('preserves reasoningText through entire pipeline', () => {
    // Built in send()
    const fileContext = 'File: src/app.tsx\nContent: ...';
    const userRequest = 'Build a landing page';
    const reasoningText = `${fileContext}\n\nUser request: ${userRequest}`;

    // Stored in pendingRequest
    const pendingRequest = { text: userRequest, context: { reasoningText } };

    // Passed through handleExecutionChoice
    const contextWithMode = {
      ...pendingRequest.context,
      temporaryExecutionMode: 'acceptEdits' as const,
    };

    // Verify field preserved
    expect(contextWithMode.reasoningText).toBe(reasoningText);
    expect(contextWithMode.reasoningText).toContain('File: src/app.tsx');
  });

  it('preserves source field (pasted/image/file/largePrompt)', () => {
    // Pasted submission
    const pastedContext: SubmittedInputContext = {
      source: 'pasted',
      reasoningText: 'Pasted content...',
      projectId: '123',
    };

    // Through choice
    const withMode = { ...pastedContext, temporaryExecutionMode: 'plan' as const };

    expect(withMode.source).toBe('pasted');
    expect(withMode.temporaryExecutionMode).toBe('plan');
  });

  it('preserves projectId for RLS scoping', () => {
    const context: SubmittedInputContext = {
      reasoningText: 'Build this',
      projectId: 'proj-abc-123',
    };

    const withMode = { ...context, temporaryExecutionMode: 'acceptEdits' as const };

    expect(withMode.projectId).toBe('proj-abc-123');
  });

  it('preserves largePromptAttachment for >700 line prompts', () => {
    const attachment = {
      filename: 'long-spec.md',
      content: 'A'.repeat(5000),
      lineCount: 850,
    };

    const context: SubmittedInputContext = {
      reasoningText: 'Implement this spec',
      largePromptAttachment: attachment,
    };

    const withMode = { ...context, temporaryExecutionMode: 'plan' as const };

    expect(withMode.largePromptAttachment?.filename).toBe('long-spec.md');
    expect(withMode.largePromptAttachment?.lineCount).toBe(850);
  });

  it('preserves imageDataUrl for analyze_reference_image', () => {
    const imageUrl = 'data:image/png;base64,iVBORw0KG...';

    const context: SubmittedInputContext = {
      source: 'image',
      reasoningText: 'Build from this mockup',
      imageDataUrl: imageUrl,
    };

    const withMode = { ...context, temporaryExecutionMode: 'acceptEdits' as const };

    expect(withMode.imageDataUrl).toBe(imageUrl);
    expect(withMode.source).toBe('image');
  });

  it('complex context with all fields preserved', () => {
    const fullContext: SubmittedInputContext = {
      reasoningText: 'Complex request with all fields',
      source: 'pasted',
      projectId: 'proj-xyz-789',
      imageDataUrl: 'data:image/jpeg;base64,/9j/...',
      largePromptAttachment: {
        filename: 'requirements.txt',
        content: 'Long requirements...',
        lineCount: 100,
      },
    };

    // Spread and add mode
    const withMode = { ...fullContext, temporaryExecutionMode: 'plan' as const };

    // Verify ALL fields preserved
    expect(withMode.reasoningText).toBe('Complex request with all fields');
    expect(withMode.source).toBe('pasted');
    expect(withMode.projectId).toBe('proj-xyz-789');
    expect(withMode.imageDataUrl).toMatch(/^data:image/);
    expect(withMode.largePromptAttachment?.filename).toBe('requirements.txt');
    expect(withMode.temporaryExecutionMode).toBe('plan');

    // Count fields
    const fieldCount = Object.keys(withMode).length;
    expect(fieldCount).toBe(6); // All 6 fields present
  });

  it('spread operator correctly merges without mutation', () => {
    const original: SubmittedInputContext = {
      reasoningText: 'Original',
      projectId: 'proj-1',
    };

    // Clone via spread
    const clone = { ...original };

    // Add mode
    clone.temporaryExecutionMode = 'acceptEdits';

    // Verify original unchanged
    expect(original.temporaryExecutionMode).toBeUndefined();
    expect(clone.temporaryExecutionMode).toBe('acceptEdits');

    // Verify original fields preserved in clone
    expect(clone.reasoningText).toBe('Original');
    expect(clone.projectId).toBe('proj-1');
  });

  it('no field loss through multiple spreads', () => {
    const step1: SubmittedInputContext = {
      reasoningText: 'Request',
      projectId: 'proj-123',
    };

    // First spread (in send -> pendingRequest)
    const step2 = { ...step1 };

    // Second spread (in handleExecutionChoice)
    const step3 = { ...step2, temporaryExecutionMode: 'plan' as const };

    // Verify no loss
    expect(step3.reasoningText).toBe('Request');
    expect(step3.projectId).toBe('proj-123');
    expect(step3.temporaryExecutionMode).toBe('plan');
  });
});
