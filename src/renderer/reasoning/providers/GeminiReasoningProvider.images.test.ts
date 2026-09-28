import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiReasoningProvider } from './GeminiReasoningProvider';
import type { ReasoningMessage } from '../ReasoningTypes';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function msg(role: ReasoningMessage['role'], content: string, extras: Partial<ReasoningMessage> = {}): ReasoningMessage {
  return { id: `${role}-${Math.random()}`, role, content, createdAt: 0, status: 'final', ...extras };
}

async function sentContents(history: ReasoningMessage[]): Promise<{ role: string; parts: Record<string, unknown>[] }[]> {
  let body = '';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    body = init.body;
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }));
  const provider = createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite' });
  await new Promise<void>((resolve) => {
    provider.streamResponse({ systemPrompt: '', history, input: '', tools: [] }, { onComplete: () => resolve(), onError: () => resolve() });
  });
  return JSON.parse(body).contents;
}

describe('Gemini request: images on tool results (inspect_evidence)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the image bytes as an inlineData part beside the function response — never a path', async () => {
    const contents = await sentContents([
      msg('user', 'fix the checkout layout'),
      msg('assistant', '', { toolCalls: [{ id: 't1', name: 'inspect_evidence', arguments: { phase: 'before' } }] }),
      msg('tool', '{"ok":true}', { toolCallId: 't1', name: 'inspect_evidence', images: [{ mimeType: 'image/png', data: PNG }] }),
    ]);
    const last = contents.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.parts[0]).toHaveProperty('functionResponse');
    expect(last.parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: PNG } });
  });

  it('only the two newest image results keep their images; older ones get a note instead', async () => {
    const history: ReasoningMessage[] = [msg('user', 'go')];
    for (let i = 1; i <= 3; i += 1) {
      history.push(msg('assistant', '', { toolCalls: [{ id: `t${i}`, name: 'inspect_evidence', arguments: {} }] }));
      history.push(msg('tool', `{"n":${i}}`, { toolCallId: `t${i}`, name: 'inspect_evidence', images: [{ mimeType: 'image/png', data: PNG }] }));
    }
    const toolTurns = (await sentContents(history)).filter((c) => c.parts.some((p) => 'functionResponse' in p));
    expect(toolTurns.map((c) => c.parts.filter((p) => 'inlineData' in p).length)).toEqual([0, 1, 1]);
    expect(JSON.stringify(toolTurns[0])).toContain('no longer attached');
  });

  it('text-only tool results are unchanged', async () => {
    const contents = await sentContents([
      msg('user', 'go'),
      msg('assistant', '', { toolCalls: [{ id: 't1', name: 'read_file', arguments: {} }] }),
      msg('tool', 'file text', { toolCallId: 't1', name: 'read_file' }),
    ]);
    expect(contents.at(-1)!.parts).toEqual([{ functionResponse: { name: 'read_file', response: { result: 'file text' } } }]);
  });
});
