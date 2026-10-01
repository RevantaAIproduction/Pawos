/**
 * Development-only audit of what one Gemini request actually sends — how its input splits across the
 * system prompt, tool definitions, conversation history and the new user input. Token figures are
 * ESTIMATES (characters ÷ 4 over the exact JSON sent); an optional real total from Gemini's free
 * countTokens API is logged separately when available. Never logs the API key, the user's text, or
 * any history/tool-result content — only sizes, counts, tool names, and short labels of PawOS's own
 * system-prompt sections.
 */

export type GeminiRequestBody = {
  contents: unknown[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: { function_declarations: { name: string; description?: string; parameters?: unknown }[] }[];
  generationConfig?: unknown;
};

export type GeminiInputAudit = {
  estimated: true;
  /** The user's original message before any request compression (equal to userInputTokens until a
   *  compressor exists). */
  rawUserInputTokens: number;
  /** The user turn actually sent. */
  userInputTokens: number;
  /** userInputTokens ÷ rawUserInputTokens (1 = sent unchanged). */
  compressionRatio: number;
  systemTokens: number;
  toolTokens: number;
  historyTokens: number;
  totalInputTokens: number;
  toolCount: number;
  messageCount: number;
  largestSystemSections: { label: string; tokens: number }[];
  largestTools: { name: string; tokens: number }[];
};

const estimateTokens = (chars: number) => Math.ceil(chars / 4);
const jsonChars = (value: unknown) => (value === undefined ? 0 : JSON.stringify(value).length);

/** True only in a development build (`npm run dev`); packaged builds are webpack `production`. */
export function isGeminiInputAuditEnabled(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * `userInput` is the new user turn (the last entry of `contents` when non-empty); everything before
 * it is history. For a tool-result continuation (`userInput` === '') all contents count as history.
 */
export function auditGeminiRequest(body: GeminiRequestBody, userInput: string, rawUserInput: string = userInput): GeminiInputAudit {
  const contents = body.contents ?? [];
  const hasNewUserTurn = userInput.length > 0 && contents.length > 0;
  const historyContents = hasNewUserTurn ? contents.slice(0, -1) : contents;
  const userContent = hasNewUserTurn ? contents[contents.length - 1] : undefined;

  const systemText = body.systemInstruction?.parts.map((p) => p.text).join('\n\n') ?? '';
  const declarations = body.tools?.flatMap((t) => t.function_declarations) ?? [];

  const systemTokens = estimateTokens(jsonChars(body.systemInstruction));
  const toolTokens = estimateTokens(jsonChars(body.tools));
  const historyTokens = estimateTokens(jsonChars(historyContents));
  const userParts = (userContent as { parts?: { text?: unknown }[] } | undefined)?.parts ?? [];
  const userTextChars = userParts.reduce((sum, p) => sum + (typeof p.text === 'string' ? p.text.length : 0), 0);
  const userInputTokens = estimateTokens(userTextChars);

  const largestSystemSections = systemText
    .split(/\n{2,}/)
    .map((section) => ({ label: section.trim().slice(0, 48).replace(/\s+/g, ' '), tokens: estimateTokens(section.length) }))
    .filter((s) => s.label)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  const largestTools = declarations
    .map((d) => ({ name: d.name, tokens: estimateTokens(jsonChars(d)) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);

  const rawUserInputTokens = hasNewUserTurn ? estimateTokens(rawUserInput.length) : 0;
  return {
    estimated: true,
    rawUserInputTokens,
    userInputTokens,
    compressionRatio: rawUserInputTokens > 0 ? Math.round((userInputTokens / rawUserInputTokens) * 100) / 100 : 1,
    systemTokens,
    toolTokens,
    historyTokens,
    totalInputTokens: userInputTokens + systemTokens + toolTokens + historyTokens,
    toolCount: declarations.length,
    messageCount: contents.length,
    largestSystemSections,
    largestTools,
  };
}

export function formatGeminiInputAudit(model: string, audit: GeminiInputAudit, contextPath = 'full'): string {
  return [
    `[Gemini Input Audit] model=${model} path=${contextPath} (token counts ESTIMATED: chars/4)`,
    `rawUserInputTokens: ${audit.rawUserInputTokens}`,
    `userInputTokens (sent): ${audit.userInputTokens}`,
    `compressionRatio: ${audit.compressionRatio}`,
    `systemTokens: ${audit.systemTokens}`,
    `toolTokens: ${audit.toolTokens}`,
    `historyTokens: ${audit.historyTokens}`,
    `totalInputTokens: ${audit.totalInputTokens}`,
    `toolCount: ${audit.toolCount}`,
    `messageCount: ${audit.messageCount}`,
    `largestSystemSections: ${audit.largestSystemSections.map((s) => `"${s.label}…"=${s.tokens}`).join(' | ') || '(none)'}`,
    `largestTools: ${audit.largestTools.map((t) => `${t.name}=${t.tokens}`).join(', ') || '(none)'}`,
  ].join('\n');
}

/**
 * Real prompt-token total from Gemini's countTokens API (free, no generation). Uses
 * `generateContentRequest` so the system instruction and tools are counted too — a bare top-level
 * `contents` request would count the messages only. Resolves null on any failure.
 */
export async function countGeminiInputTokens(
  baseUrl: string,
  model: string,
  apiKey: string,
  body: GeminiRequestBody,
  fetchImpl: typeof fetch = fetch
): Promise<number | null> {
  try {
    const { generationConfig: _ignored, ...request } = body;
    const res = await fetchImpl(`${baseUrl}/models/${model}:countTokens?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, ...request } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { totalTokens?: unknown };
    return typeof json.totalTokens === 'number' ? json.totalTokens : null;
  } catch {
    return null;
  }
}
