/**
 * Simple factual/general questions ("What is HTTP?", "Explain recursion.", "Convert 10 km to miles.")
 * are sent with a one-line system instruction, ZERO tools and no history (see
 * ConversationRuntime.minimalQuestionMode / ReasoningRuntime.runTurn's `minimal` option). The user's
 * text is never rewritten — the savings come only from leaving out PawOS's universal prompt and tools.
 *
 * Deterministic and deliberately conservative: a message takes the minimal path only if it clearly
 * looks like a self-contained knowledge question AND contains none of the signals below that it might
 * need a tool, the user's files/accounts/screen, PawOS product knowledge, live/current information,
 * or earlier conversation. When unsure, the full path is used — never the other way round.
 */

export const MINIMAL_QUESTION_SYSTEM_PROMPT = "You are PawOS. Answer the user's question accurately and concisely.";

const MAX_LENGTH = 240;

/** Starts like a knowledge question, or is a question. */
const QUESTION_START = /^(what|what's|whats|who|who's|whos|when|where|why|how|which|whose|is|are|was|were|does|do|did|can|could|should|would|will|explain|define|describe|convert|calculate|compute|translate|summarize|tell me (about|what|why|how|who)|difference between|meaning of)\b/;

/**
 * Asking PawOS to DO something rather than answer: a polite request other than explaining
 * ("can you open…", "could you check…"), "please"/"for me", or a continuation/confirmation phrase.
 * (Imperatives like "Fix this bug." never pass QUESTION_START in the first place.)
 */
const ACTION = /^(can|could|would|will) you (please )?(?!(explain|tell|define|describe|summari[sz]e|translate|convert|calculate)\b)\w+|\b(please|for me|do it|do that|go ahead|continue|resume|proceed|retry|try again|undo|revert|remind|schedule)\b/;

/** The user's own things, device, projects or accounts. */
const PERSONAL = /\b(my|mine|our|ours|me|i|i'm|i've|i'd|we|us)\b/;

/** Files, code, paths, projects, apps, the screen. */
const WORKSPACE = /(\/|\\|\.(ts|tsx|js|jsx|py|java|cs|go|rs|rb|php|json|ya?ml|md|txt|css|html|sql|env|sh|ps1|pdf|docx?|xlsx?|pptx?|csv)\b)|\b(file|files|folder|folders|directory|repo|repository|project|codebase|line \d+|stack trace|screen|window|clipboard|desktop|computer|laptop|pc|app|browser|tab|terminal|pr|pull request|ticket|jira|linear|github|gitlab|slack|calendar|inbox|meeting)\b/;

/** Anything about PawOS itself, plans, billing or accounts — needs product knowledge / real data. */
const PAWOS = /\b(paw|pawos|paw compute|pc|credits?|subscription|plan|billing|invoice|balance|account|tier|pro max|upgrade|refund)\b/;

/** Needs current/live information the model can't have without a tool. */
const LIVE = /\b(today|tonight|now|right now|currently|current|latest|recent|recently|this (week|month|year|morning|evening)|yesterday|tomorrow|news|weather|forecast|temperature outside|stock|stocks|share price|price|prices|pricing|cost|rate|rates|exchange rate|score|scores|who won|election|trending|live|open now|near me|nearby|traffic|time in|what time|what day|what date|status of|release date|20\d\d)\b|https?:\/\/|www\./;

/** Refers back to earlier conversation or something unnamed. */
const REFERENCE = /\b(that|this|these|those|it|its|it's|they|them|their|he|him|his|she|her|above|previous|earlier|before|same|again|also|instead|else|more|the other|the last|you said|you mentioned|as well)\b|^(and|but|so|then|or|also|why not|what about|how about)\b/;

/** A follow-up that compares or builds on what was just discussed. */
const FOLLOW_UP_HINT = /\b(different|difference|compare|compared|versus|vs|better|worse|similar|same as|related|why|how come)\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export type MinimalQuestionDecision =
  /** Standalone question: minimal prompt, no tools, no history. */
  | { kind: 'standalone' }
  /** Follows a previous minimal Q&A exchange: minimal prompt, no tools, only the last few text messages. */
  | { kind: 'followUp' };

/**
 * `previousWasMinimalQuestion`: the last turn was itself a minimal-path Q&A with no tool use, so a
 * short follow-up about it ("Why is that different from HTTPS?") can keep using the minimal path
 * with just those few messages as context. After any tool/task turn, references go to the full path.
 */
/**
 * The only history a minimal follow-up needs: the last few plain user/assistant text messages (no
 * tool calls, no tool results), each shortened, starting on a user message.
 */
export function recentPlainTextHistory<T extends { role: string; content: string; toolCalls?: unknown[] }>(
  history: T[],
  maxMessages = 4,
  maxChars = 1200
): T[] {
  const plain = history.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '' && !(m.toolCalls && m.toolCalls.length > 0)
  );
  const recent = plain.slice(-maxMessages);
  while (recent.length > 0 && recent[0]?.role !== 'user') recent.shift();
  return recent.map((m) => (m.content.length > maxChars ? { ...m, content: `${m.content.slice(0, maxChars)}…` } : m));
}

export function classifyMinimalQuestion(text: string, opts: { hasHistory: boolean; previousWasMinimalQuestion: boolean }): MinimalQuestionDecision | null {
  if (!text || text.length > MAX_LENGTH || text.includes('\n')) return null;
  const t = normalize(text);
  if (!QUESTION_START.test(t) && !t.endsWith('?')) return null;
  if (ACTION.test(t) || PERSONAL.test(t) || WORKSPACE.test(t) || PAWOS.test(t) || LIVE.test(t)) return null;

  const refersBack = REFERENCE.test(t) || (opts.hasHistory && FOLLOW_UP_HINT.test(t));
  if (!refersBack) return { kind: 'standalone' };
  // It depends on earlier conversation: only a follow-up to a plain Q&A exchange stays minimal.
  return opts.hasHistory && opts.previousWasMinimalQuestion ? { kind: 'followUp' } : null;
}
