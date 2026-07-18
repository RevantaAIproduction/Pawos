import { getGeminiApiKey } from './geminiApiKey';

/** JSON Schema subset accepted by Gemini's responseSchema. */
export type GeminiJsonSchema = {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, GeminiJsonSchema>;
  items?: GeminiJsonSchema;
  enum?: string[];
  required?: string[];
};

/**
 * Main-process sibling of src/renderer/ai/SessionClassifier.ts's proven
 * generateContent + responseSchema JSON-mode call. Duplicated here (rather
 * than IPC'd to the renderer) because file plugins execute entirely in
 * main and classification is a pure network call with no UI coupling.
 * Returns null on any failure — never throws, callers decide the fallback.
 */
export async function generateJson<T>(params: {
  prompt: string;
  schema: GeminiJsonSchema;
  model?: string;
  baseUrl?: string;
}): Promise<T | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;

  const { prompt, schema, model = 'gemini-flash-latest', baseUrl = 'https://generativelanguage.googleapis.com/v1beta' } = params;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  try {
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
