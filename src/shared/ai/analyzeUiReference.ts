export type UiReferenceAnalysis = {
  summary: string;
  imageCount: number;
  /** One short note per image, in the same order they were provided — e.g. "Image 1: the company logo, navy blue, minimal." Lets the model know what each individual attachment actually is within the set. */
  perImageNotes: string[];
  sections: string[];
  layout: string;
  colors: string[];
  typography: string;
  components: string[];
  navigationPattern: string;
};

export type UiVerificationResult = {
  ok: boolean;
  issues: string[];
};

/**
 * Real Gemini vision call using structured JSON output, same shape as
 * GeminiVision.ts's analyzeCompanionPhoto (fetch + inline_data +
 * responseSchema) — deliberately environment-agnostic (no DOM/window
 * globals) so it can run from either the renderer or a main-process
 * plugin (Node 18+'s global fetch). A sibling to analyzeCompanionPhoto,
 * not a modification of it: that function stays scoped to companion-
 * photo-angle validation, this one to general UI/layout understanding —
 * two different prompts/schemas over the same real API call shape.
 *
 * Accepts one or many images in a single real call (multiple inline_data
 * parts in one request) so a whole attached set (logo + product photos,
 * a multi-screen reference, ...) is understood together as ONE reference
 * set, not as isolated single-image analyses that lose track of each
 * other — the actual fix for "only the last image was ever analyzed."
 */
export async function analyzeUiReference(params: {
  apiKey: string;
  imageDataUrls: string[];
  model?: string;
  baseUrl?: string;
}): Promise<UiReferenceAnalysis> {
  const {
    apiKey,
    imageDataUrls,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  if (imageDataUrls.length === 0) throw new Error('No reference image to analyze.');

  const imageParts = imageDataUrls.map((imageDataUrl, i) => {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new Error(`Expected a base64 data: URL for reference image ${i + 1}.`);
    const [, mimeType, base64Data] = match;
    return { inline_data: { mime_type: mimeType, data: base64Data } };
  });

  const prompt =
    imageDataUrls.length === 1
      ? `You are analyzing a reference image (a screenshot, UI mockup, wireframe, logo, or design reference) so its design LANGUAGE can be reused to build an original implementation. Describe: the sections/regions present (e.g. hero, nav, cards, footer), the overall layout and visual hierarchy, the real colors you see (as hex or named approximations), the typography style (serif/sans, weight, scale), the UI components present (buttons, forms, cards, nav bar), and the navigation pattern. Also give one short note describing what this image actually is (e.g. "a logo," "a product photo," "a dashboard screenshot"). Never transcribe copyrighted text or claim to reproduce the exact image — describe the design language only.`
      : `You are analyzing ${imageDataUrls.length} reference images together, provided in order (Image 1 through Image ${imageDataUrls.length}), as ONE reference set for a single project (e.g. a logo plus product photos, or several screens of one app) — not as unrelated images. First give a one-line note per image (perImageNotes, same order) describing what each one actually is. Then describe the reference set as a whole: the sections/regions it implies (e.g. hero, nav, cards, footer), overall layout and visual hierarchy, the real colors present across the set (as hex or named approximations), typography style, the UI components present, and any navigation pattern implied. Never transcribe copyrighted text or claim to reproduce any image exactly — describe the design language only.`;

  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            perImageNotes: { type: 'array', items: { type: 'string' } },
            sections: { type: 'array', items: { type: 'string' } },
            layout: { type: 'string' },
            colors: { type: 'array', items: { type: 'string' } },
            typography: { type: 'string' },
            components: { type: 'array', items: { type: 'string' } },
            navigationPattern: { type: 'string' },
          },
          required: ['summary', 'perImageNotes', 'sections', 'layout', 'colors', 'typography', 'components', 'navigationPattern'],
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Reference image analysis request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: Partial<UiReferenceAnalysis>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Reference image analysis returned an unexpected response.');
  }

  return {
    summary: String(parsed.summary ?? ''),
    imageCount: imageDataUrls.length,
    perImageNotes: Array.isArray(parsed.perImageNotes) ? parsed.perImageNotes.map(String) : [],
    sections: Array.isArray(parsed.sections) ? parsed.sections.map(String) : [],
    layout: String(parsed.layout ?? ''),
    colors: Array.isArray(parsed.colors) ? parsed.colors.map(String) : [],
    typography: String(parsed.typography ?? ''),
    components: Array.isArray(parsed.components) ? parsed.components.map(String) : [],
    navigationPattern: String(parsed.navigationPattern ?? ''),
  };
}

/**
 * A short, concrete alt-text description for an image asset — reuses the
 * same real API call shape as analyzeUiReference with its own minimal
 * prompt/schema, not a third vision implementation.
 */
export async function generateAltTextForImage(params: {
  apiKey: string;
  imageDataUrl: string;
  model?: string;
  baseUrl?: string;
}): Promise<string> {
  const {
    apiKey,
    imageDataUrl,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Expected a base64 data: URL for the image.');
  const [, mimeType, base64Data] = match;

  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Write a concise, concrete alt-text description (under 20 words) for this image, suitable for a website\'s alt attribute. Describe what is actually visible, nothing invented.' },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'text/plain' },
    }),
  });

  if (!res.ok) {
    throw new Error(`Alt-text generation request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim();
}

/**
 * "Does this look broken" check over a real screenshot plus real
 * layout-structure signals (see ExtractPageStructurePlugin) — same
 * shape discipline as PhotoValidationResult: a plain {ok, issues[]}
 * the model reasons over, never a verdict this function invents itself
 * beyond what the image and structural data actually show.
 */
export async function verifyUiScreenshot(params: {
  apiKey: string;
  imageDataUrl: string;
  structuralIssues: string[];
  consoleErrors: string[];
  model?: string;
  baseUrl?: string;
}): Promise<UiVerificationResult> {
  const {
    apiKey,
    imageDataUrl,
    structuralIssues,
    consoleErrors,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Expected a base64 data: URL for the screenshot.');
  const [, mimeType, base64Data] = match;

  const context = [
    structuralIssues.length ? `Real layout-measurement signals found: ${structuralIssues.join('; ')}.` : 'No layout-measurement issues were detected.',
    consoleErrors.length ? `Real browser console errors: ${consoleErrors.join('; ')}.` : 'No console errors were reported.',
  ].join(' ');

  const prompt = `You are visually verifying a rendered web page from a real screenshot. ${context} Look at the actual screenshot and report any visible problems: broken/overlapping layout, misalignment, missing or broken images, obviously wrong spacing, unstyled/raw HTML, or anything that looks unfinished. Only report what you can actually see or was actually measured — never invent an issue.`;

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
            issues: { type: 'array', items: { type: 'string' } },
          },
          required: ['ok', 'issues'],
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Visual verification request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { ok?: boolean; issues?: unknown[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Visual verification returned an unexpected response.');
  }

  return {
    ok: Boolean(parsed.ok),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
  };
}
