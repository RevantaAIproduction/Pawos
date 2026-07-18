export type PhotoValidationResult = {
  ok: boolean;
  detectedAngle: string;
  issues: string[];
};

/**
 * Real Gemini vision call using structured JSON output (generationConfig
 * .responseSchema) so the result is reliably parseable rather than
 * scraped from free-form text. Used by the Companion Lab capture flow to
 * validate each photo before allowing the user to continue — never
 * generates the final avatar, only checks the input is usable.
 */
export async function analyzeCompanionPhoto(params: {
  apiKey: string;
  imageDataUrl: string;
  expectedAngle: string;
  model?: string;
  baseUrl?: string;
}): Promise<PhotoValidationResult> {
  const {
    apiKey,
    imageDataUrl,
    expectedAngle,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Expected a base64 data: URL for the photo.');
  const [, mimeType, base64Data] = match;

  const prompt = `You are validating a photo submitted for the "${expectedAngle}" angle capture step of a companion-avatar creation flow. Assess: is a person/face visible; does the pose roughly match "${expectedAngle}"; is lighting adequate; is anything occluding the face (hands, hair, objects, sunglasses, hat). Respond with your assessment.`;

  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            detectedAngle: { type: 'string' },
            issues: { type: 'array', items: { type: 'string' } },
          },
          required: ['ok', 'detectedAngle', 'issues'],
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Photo validation request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { ok?: boolean; detectedAngle?: string; issues?: unknown[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Photo validation returned an unexpected response.');
  }

  return {
    ok: Boolean(parsed.ok),
    detectedAngle: String(parsed.detectedAngle ?? 'unknown'),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
  };
}
