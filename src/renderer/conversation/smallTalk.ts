/**
 * Pure greetings and thank-yous are answered locally — no Gemini call at all (see
 * ConversationRuntime.shouldAnswerLocally). Deliberately a closed list: anything that isn't clearly a
 * greeting or thanks (a question, a request, extra words, "ok"/"yes"/"do it"/"continue" and other
 * possible follow-ups) goes through the normal reasoning path unchanged. Even a greeting or thanks
 * goes to the model when Paw's last message asked a question, since it may be part of an answer.
 */

type SmallTalkKind = 'greeting' | 'morning' | 'afternoon' | 'evening' | 'night' | 'whatsUp' | 'thanks';

const PATTERNS: [SmallTalkKind, RegExp][] = [
  ['morning', /^(good morning|gm)$/],
  ['afternoon', /^good afternoon$/],
  ['evening', /^good evening$/],
  ['night', /^good night$/],
  ['whatsUp', /^(sup|wh?at'?s up|wassup|wazzup)$/],
  ['greeting', /^(h+i+|h+e+y+|hel+o+|hola|yo)$/],
  ['thanks', /^(thanks?|thank you|thank u|thanks a lot|thanks so much|thank you so much|thank you very much|thx|ty|tysm|cheers)$/],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, ' ')
    .replace(/[!.?,:;~*()\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(paw|there|buddy|bro|mate)$/, '')
    .trim();
}

function smallTalkKind(text: string): SmallTalkKind | null {
  if (!text || text.length > 40 || text.includes('\n')) return null;
  const t = normalize(text);
  if (!t) return null;
  return PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null;
}

export function isSmallTalkMessage(text: string, opts: { lastAssistantMessage?: string } = {}): boolean {
  if (!smallTalkKind(text)) return false;
  return !(opts.lastAssistantMessage?.trim().endsWith('?') ?? false);
}

const REPLIES: Record<SmallTalkKind, string> = {
  greeting: 'Hi! What can I help you with?',
  morning: 'Good morning! What would you like to work on today?',
  afternoon: 'Good afternoon! What can I help you with?',
  evening: 'Good evening! What can I help you with?',
  night: 'Good night! I\'m here whenever you need me.',
  whatsUp: 'All good here — ready when you are. What can I help you with?',
  thanks: 'You\'re welcome! Let me know if there\'s anything else.',
};

/** Paw's short local reply to a greeting or thanks (only call after isSmallTalkMessage is true). */
export function localSmallTalkReply(text: string): string {
  return REPLIES[smallTalkKind(text) ?? 'greeting'];
}

