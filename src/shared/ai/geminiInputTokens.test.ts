import { describe, expect, it, vi } from 'vitest';
import { measureGeminiInputTokens, utf8ByteUpperBound } from './geminiInputTokens';

const body = {
  contents: [{ role: 'user', parts: [{ text: 'Fix the bug in src/auth/login.ts — émojis 🐾 included' }] }],
  systemInstruction: { parts: [{ text: 'You are PawOS.' }] },
  tools: [{ function_declarations: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }] }],
};

describe('measureGeminiInputTokens', () => {
  it('uses countTokens on the exact request (system instruction and tools included)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ totalTokens: 76 }), { status: 200 }));
    const result = await measureGeminiInputTokens({ baseUrl: 'https://g', model: 'gemini-3.1-pro-preview', apiKey: 'k', body, fetchImpl });
    expect(result).toEqual({ tokens: 76, upperBound: false });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://g/models/gemini-3.1-pro-preview:countTokens');
    const sent = JSON.parse(String(init.body));
    expect(sent.generateContentRequest.model).toBe('models/gemini-3.1-pro-preview');
    expect(sent.generateContentRequest.systemInstruction).toEqual(body.systemInstruction);
    expect(sent.generateContentRequest.tools).toEqual(body.tools);
  });

  it('N: when countTokens fails, falls back to the UTF-8 byte upper bound (never below the real count)', async () => {
    for (const failing of [
      vi.fn(async () => new Response('err', { status: 500 })),
      vi.fn(async () => { throw new Error('offline'); }),
      vi.fn(async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 })),
    ]) {
      const result = await measureGeminiInputTokens({ baseUrl: 'https://g', model: 'm', apiKey: 'k', body, fetchImpl: failing });
      expect(result.upperBound).toBe(true);
      expect(result.tokens).toBe(utf8ByteUpperBound(body));
    }
    // Every token is at least one byte of the text, so bytes bound tokens from above.
    const text = 'Fix the bug in src/auth/login.ts — émojis 🐾 included';
    expect(utf8ByteUpperBound(body)).toBeGreaterThan(new TextEncoder().encode(text).length);
  });
});
