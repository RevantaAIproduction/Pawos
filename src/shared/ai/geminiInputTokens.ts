/**
 * Input-token measurement for a usage reservation, done BEFORE the Gemini call.
 *
 * Primary: Gemini's countTokens on the exact request (free; it matched the billed promptTokenCount
 * exactly on every model tested). Fallback when countTokens fails: the UTF-8 byte length of the
 * serialized request — never fewer than the real token count (every token is at least one byte of
 * the text, and the JSON adds more), so a reservation priced on it can only be too large, never too
 * small. Images inside the request make this bound very large; that is the intended, safe direction.
 */
export type GeminiInputMeasurement = { tokens: number; upperBound: boolean };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The parts of a generateContent body that count as input. */
type GeminiInputBody = {
  contents?: unknown;
  systemInstruction?: unknown;
  tools?: unknown;
  toolConfig?: unknown;
};

export function utf8ByteUpperBound(body: GeminiInputBody): number {
  const text = JSON.stringify({
    contents: body.contents ?? [],
    systemInstruction: body.systemInstruction ?? null,
    tools: body.tools ?? null,
    toolConfig: body.toolConfig ?? null,
  });
  return new TextEncoder().encode(text).length;
}

export async function measureGeminiInputTokens(params: {
  baseUrl: string;
  model: string;
  apiKey: string;
  body: GeminiInputBody;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<GeminiInputMeasurement> {
  const { baseUrl, model, apiKey, body } = params;
  const fetchImpl = params.fetchImpl ?? fetch;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), params.timeoutMs ?? 15_000) : null;
  try {
    const res = await fetchImpl(`${baseUrl}/models/${model}:countTokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      // countTokens must see exactly what generateContent will — system instruction and tools
      // included — which only the generateContentRequest form carries.
      body: JSON.stringify({
        generateContentRequest: {
          model: `models/${model}`,
          contents: body.contents ?? [],
          ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
          ...(body.tools ? { tools: body.tools } : {}),
          ...(body.toolConfig ? { toolConfig: body.toolConfig } : {}),
        },
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.ok) {
      const json = (await res.json()) as { totalTokens?: unknown };
      if (typeof json.totalTokens === 'number' && Number.isFinite(json.totalTokens) && json.totalTokens >= 0) {
        return { tokens: Math.ceil(json.totalTokens), upperBound: false };
      }
    }
  } catch {
    // fall through to the upper bound
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { tokens: utf8ByteUpperBound(body), upperBound: true };
}
