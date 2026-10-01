import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiReasoningProvider } from './GeminiReasoningProvider';
import type { GeminiUsageGate } from './geminiUsageReservation';

function sse(chunks: unknown[]): Response {
  return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function fakeGate(reserveResult: Awaited<ReturnType<GeminiUsageGate['reserve']>> = { ok: true, reservationId: 'res-1', maxOutputTokens: 1666 }) {
  return {
    reserve: vi.fn(async () => reserveResult),
    settle: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
}

function run(provider: ReturnType<typeof createGeminiReasoningProvider>) {
  return new Promise<{ text?: string; error?: Error }>((resolve) => {
    provider.streamResponse(
      { systemPrompt: 'You are PawOS.', history: [], input: 'hello there', tools: [] },
      { onDelta: () => {}, onComplete: (text) => resolve({ text }), onError: (error) => resolve({ error }) },
    );
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Gemini provider — every request is reserved before it is sent', () => {
  it('countTokens → reserve → Gemini with the GRANTED maxOutputTokens → settle with usageMetadata', async () => {
    const calls: string[] = [];
    let generateBody: any = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url.includes(':countTokens') ? 'countTokens' : 'generate');
      if (url.includes(':countTokens')) return new Response(JSON.stringify({ totalTokens: 42 }), { status: 200 });
      generateBody = JSON.parse(String(init.body));
      return sse([
        { candidates: [{ content: { parts: [{ text: 'Hi!' }] } }], usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 3, thoughtsTokenCount: 10 } },
      ]);
    }));
    const gate = fakeGate();
    const result = await run(createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.1-pro-preview', usageGate: gate, getPawModelId: () => 'paw-core' }));

    expect(result.text).toBe('Hi!');
    expect(calls).toEqual(['countTokens', 'generate']);
    expect(gate.reserve).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3.1-pro-preview', inputTokens: 42, inputIsUpperBound: false, maxOutputTokens: 8000, pawModelId: 'paw-core' }));
    expect(generateBody.generationConfig.maxOutputTokens).toBe(1666); // the cap that keeps the call inside its reservation
    await vi.waitFor(() => expect(gate.settle).toHaveBeenCalled());
    expect(gate.settle).toHaveBeenCalledWith({
      reservationId: 'res-1',
      usageEventId: expect.any(String),
      usage: { promptTokens: 42, candidatesTokens: 3, cachedTokens: 0, thoughtsTokens: 10 },
    });
    expect(gate.release).not.toHaveBeenCalled();
  });

  it('a refused reservation never calls Gemini and shows the customer message', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes(':countTokens') ? new Response(JSON.stringify({ totalTokens: 10 }), { status: 200 }) : sse([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gate = fakeGate({ ok: false, reason: 'plan_weekly_paced', message: 'Weekly limit reached\nWait for the reset.' });
    const result = await run(createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.1-pro-preview', usageGate: gate }));
    expect(result.error?.message).toMatch(/^Weekly limit reached/);
    expect(fetchMock.mock.calls.filter(([url]) => !String(url).includes(':countTokens'))).toHaveLength(0);
    expect(gate.settle).not.toHaveBeenCalled();
  });

  it('M: a Gemini error with no usage releases the reservation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes(':countTokens') ? new Response(JSON.stringify({ totalTokens: 10 }), { status: 200 }) : new Response('quota', { status: 429 }),
    ));
    const gate = fakeGate();
    const result = await run(createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite', usageGate: gate }));
    expect(result.error?.message).toMatch(/429/);
    await vi.waitFor(() => expect(gate.release).toHaveBeenCalledWith('res-1'));
    expect(gate.settle).not.toHaveBeenCalled();
  });

  it('N: countTokens failure reserves on the conservative UTF-8 byte upper bound', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes(':countTokens') ? new Response('down', { status: 503 }) : sse([{ candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 1 } }]),
    ));
    const gate = fakeGate();
    await run(createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite', usageGate: gate }));
    const reserved = (gate.reserve.mock.calls[0] as unknown as [{ inputTokens: number; inputIsUpperBound: boolean }])[0];
    expect(reserved.inputIsUpperBound).toBe(true);
    expect(reserved.inputTokens).toBeGreaterThan(9);
  });

  it('a stream that ends without usageMetadata is settled from the input and the text received, never released as free', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes(':countTokens') ? new Response(JSON.stringify({ totalTokens: 50 }), { status: 200 }) : sse([{ candidates: [{ content: { parts: [{ text: 'abcdefgh' }] } }] }]),
    ));
    const gate = fakeGate();
    await run(createGeminiReasoningProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite', usageGate: gate }));
    await vi.waitFor(() => expect(gate.settle).toHaveBeenCalled());
    expect(gate.settle).toHaveBeenCalledWith(expect.objectContaining({ usage: { promptTokens: 50, candidatesTokens: 2, cachedTokens: 0, thoughtsTokens: 0 } }));
    expect(gate.release).not.toHaveBeenCalled();
  });
});
