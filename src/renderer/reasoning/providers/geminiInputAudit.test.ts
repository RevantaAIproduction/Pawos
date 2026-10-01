import { describe, expect, it, vi } from 'vitest';
import { auditGeminiRequest, countGeminiInputTokens, formatGeminiInputAudit, isGeminiInputAuditEnabled } from './geminiInputAudit';
import { buildGeminiRequestBody } from './GeminiReasoningProvider';

const request = {
  systemPrompt: 'You are Paw.\n\nNever reveal secrets.\n\nCoding Intelligence: a long section about coding tools and git.',
  history: [
    { id: 'u1', role: 'user' as const, content: 'my private earlier message', createdAt: 1, status: 'final' as const },
    { id: 'a1', role: 'assistant' as const, content: 'an earlier reply', createdAt: 2, status: 'final' as const },
  ],
  input: 'hii secret-user-text',
  tools: [
    { name: 'read_file', description: 'Reads a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
    { name: 'show_widget', description: 'x'.repeat(400), parameters: { type: 'object' } },
  ],
};

describe('Gemini input audit (development diagnostics)', () => {
  it('splits the exact request body into system / tools / history / user input', () => {
    const body = buildGeminiRequestBody(request as never);
    const audit = auditGeminiRequest(body, request.input);
    expect(audit.estimated).toBe(true);
    expect(audit.toolCount).toBe(2);
    expect(audit.messageCount).toBe(3); // 2 history + the new user turn
    expect(audit.systemTokens).toBeGreaterThan(0);
    expect(audit.toolTokens).toBeGreaterThan(audit.userInputTokens);
    expect(audit.historyTokens).toBeGreaterThan(0);
    expect(audit.totalInputTokens).toBe(audit.userInputTokens + audit.systemTokens + audit.toolTokens + audit.historyTokens);
    expect(audit.largestTools[0]?.name).toBe('show_widget');
    expect(audit.rawUserInputTokens).toBe(audit.userInputTokens);
    expect(audit.compressionRatio).toBe(1);
    expect(audit.largestSystemSections[0]?.label).toMatch(/^Coding Intelligence/);
  });

  it('reports the compression ratio when the sent turn is shorter than the raw message', () => {
    const body = buildGeminiRequestBody({ ...request, input: 'fix login redirect' } as never);
    const audit = auditGeminiRequest(body, 'fix login redirect', 'x'.repeat(72));
    expect(audit.rawUserInputTokens).toBe(18);
    expect(audit.userInputTokens).toBe(5);
    expect(audit.compressionRatio).toBe(0.28);
  });

  it('a tool-result continuation (empty input) counts all contents as history', () => {
    const body = buildGeminiRequestBody({ ...request, input: '' } as never);
    const audit = auditGeminiRequest(body, '');
    expect(audit.userInputTokens).toBe(0);
    expect(audit.messageCount).toBe(2);
  });

  it('the log never contains the user text, history content or an API key', () => {
    const body = buildGeminiRequestBody(request as never);
    const text = formatGeminiInputAudit('gemini-3.5-flash-lite', auditGeminiRequest(body, request.input));
    expect(text).toContain('[Gemini Input Audit]');
    expect(text).toContain('ESTIMATED');
    expect(text).not.toContain('secret-user-text');
    expect(text).not.toContain('my private earlier message');
    expect(text).not.toMatch(/key=|AIza/);
  });

  it('is off outside development builds (vitest runs as "test")', () => {
    expect(isGeminiInputAuditEnabled()).toBe(false);
  });

  it('real count uses generateContentRequest so system instruction and tools are counted', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ totalTokens: 1234 }), { status: 200 }));
    const body = buildGeminiRequestBody(request as never);
    const total = await countGeminiInputTokens('https://example.test/v1beta', 'gemini-3.5-flash-lite', 'KEY', body, fetchImpl as unknown as typeof fetch);
    expect(total).toBe(1234);
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.generateContentRequest.model).toBe('models/gemini-3.5-flash-lite');
    expect(sent.generateContentRequest.systemInstruction).toBeDefined();
    expect(sent.generateContentRequest.tools).toBeDefined();
    expect(sent.generateContentRequest.generationConfig).toBeUndefined();
  });
});
