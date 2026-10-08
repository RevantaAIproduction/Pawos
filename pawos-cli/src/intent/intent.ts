/**
 * Intent first. Before anything is done with what the user typed in a project, PawOS decides what
 * kind of thing it is: conversation (a greeting, a question, a request to explain or plan) or a real
 * task (an instruction to change the project). Only a real task goes on to the permission question
 * and the code-change runner; conversation goes to chat and never near the repository.
 *
 * The decision is about what the user is ASKING PawOS TO DO, read from the whole request — its mood
 * and its head, not whether a word like "fix" appears somewhere in it:
 *
 *   "Fix the login bug"                                  an instruction            → task
 *   "Go ahead and fix the login bug"                     an instruction            → task
 *   "Can you fix the login bug?"                         a request for the action  → task
 *   "Explain how I could fix the login bug"              a request to explain      → chat
 *   "What files would you change to fix the login bug?"  a question                → chat
 *   "Why is the login failing?"                          a question                → chat
 *   "The login is broken"                                a statement, no request   → chat
 *
 * It runs here, on this computer, on the text alone. PawOS's service offers no classification call
 * a client could use, and asking the chat model would send (and count, and store) a message just to
 * decide what to do with a message. So this is a small, deterministic reading of the sentence. When
 * it cannot tell, the answer is conversation: a request wrongly chatted costs one reply and can be
 * sent again with `/code`, while a change wrongly started would touch the repository.
 */
export type Intent = "chat" | "task";

export type IntentReason =
  /** Nothing to act on. */
  | "empty"
  /** A greeting, thanks or small talk. */
  | "greeting"
  /** A question: it asks for an answer, not an action. */
  | "question"
  /** A request to explain, describe, plan or advise. */
  | "explanation"
  /** The user said not to change anything, or to only explain. */
  | "no_change_wanted"
  /** Looking into something ("find…", "check…") with no change asked for. */
  | "investigation"
  /** An instruction with nothing to act on ("fix it", "go ahead"). */
  | "unspecific"
  /** Something said about the project, with no request attached. */
  | "statement"
  /** An instruction to change the project. */
  | "directive"
  /** A polite request for the change itself ("can you…", "please…", "I want you to…"). */
  | "request";

export interface IntentDecision {
  intent: Intent;
  reason: IntentReason;
}

const chat = (reason: IntentReason): IntentDecision => ({ intent: "chat", reason });
const task = (reason: IntentReason): IntentDecision => ({ intent: "task", reason });

const GREETING =
  /^(h+i+|h+e+y+|hello+|helo+|yo+|hola|namaste|sup|gm|gn|good (morning|afternoon|evening|night|day)|thanks?( you)?( so much| a lot)?|thank you|thx|ty|ok(ay)?|k|cool|nice|great|awesome|perfect|got it|i see|bye|goodbye|see you|cheers|welcome|how are you( doing)?|how's it going|how is it going|what's up|whats up|who are you|test(ing)?|ping|lol|haha+)\b[\s!.?,]*(there|paw|pawos|team|again)?[\s!.?,]*$/i;

/** The user is ruling a change out: "don't change anything", "without modifying…", "just explain…", "no changes". */
const NO_CHANGE =
  /\b(do not|don'?t|dont|never|without|no need to|not asking you to|not yet|before you) (chang|modif|edit|touch|push|commit|writ|updat|fix|appl|mak)\w*|\b(just|only|simply) (explain|tell|show|describe|answer|plan|outline|list|talk)\b|\bno (code )?changes?\b|\bread[- ]only\b|\bdon'?t do anything\b/i;

/** Openers that carry no intent of their own: "ok, so…", "hey paw,", "also", "and then". */
const FILLER = /^((ok(ay)?|alright|right|yes|yeah|yep|yup|sure|well|so|now|then|also|and|next|first|hey|hi|hello|paw|pawos|um+|uh+)\b[\s,!.:;-]*)+/i;

/** Polite ways of asking for an action. What follows decides the intent. */
const ASK_YOU = /^((can|could|would|will|wont|won't) (you|u|ya|we)\b( please| kindly| just| now| quickly)*\s+|would you mind\s+|i( want| need| would like|'d like|’d like|d like) (you|u|pawos|paw) to\s+|i( want| need| would like|'d like|’d like|d like) to\s+|(we|you) (need|have|ought|should|must)( to)?\s+|(you|we) (can|may|should) (now )?(go ahead and )?\s*|let'?s\s+|time to\s+|go ahead and\s+|go ahead,?\s+|feel free to\s+|(please|kindly|pls|plz)\s+|help me (to )?(?!understand|see|learn|figure|know)\s*)+/i;

/** A question: it starts like one. ("can you…" / "could you…" are requests, handled before this.) */
const QUESTION_START =
  /^(what|whats|what's|why|how|hows|how's|who|whom|whose|when|where|which|is|isn't|isnt|are|aren't|was|were|am|do|does|doesn't|did|didn't|should|shall|may|might|must|has|have|had|can|could|would|will|any|anyone|anything|is there|are there)\b/i;

/** A request for words, not work: explain, describe, plan, advise. */
const EXPLAIN_HEAD =
  /^(explain|describe|tell|teach|clarify|elaborate|summari[sz]e|compare|define|suggest|recommend|advise|outline|brainstorm|discuss|walk (me|us) through|show (me|us)\b|give (me|us)\b|help (me|us) (understand|see|learn|figure|know)|talk (me|us)? ?(through|about)|list\b|plan\b|estimate|think about|consider|imagine|say\b|answer)\b/i;

/** Things one does TO a project. As the head of an instruction, each asks for a change. */
const CHANGE_HEAD =
  /^(fix|add|change|update|remove|delete|rename|implement|create|build|refactor|replace|make|write|move|set|convert|upgrade|downgrade|migrate|style|restyle|redesign|edit|modify|improve|optimi[sz]e|clean( up)?|tidy( up)?|bump|revert|undo|disable|enable|support|handle|extract|split|merge|wire( up)?|hook( up)?|integrate|translate|format|lint|document|introduce|adjust|tweak|correct|repair|resolve|patch|insert|append|prepend|swap|switch|increase|decrease|reduce|simplify|rewrite|restructure|reorgani[sz]e|drop|hide|show|center|centre|align|expose|export|import|install|configure|set ?up|use|apply|allow|prevent|stop|ensure|validate|saniti[sz]e|cache|log|capitali[sz]e|locali[sz]e|deprecate|port|scaffold|generate|polish|harden|secure|speed up|shorten|lengthen|rework|finish|complete|turn|put|get rid of|strip|wrap|unwrap|inline|deduplicate|dedupe|pin|unpin|rebrand|theme)\b/i;

/** Looking, not changing. On their own these ask PawOS to find something out. */
const LOOK_HEAD = /^(run|find|check|look|search|locate|identify|investigate|debug|diagnose|inspect|trace|test|verify|scan|audit|review|analy[sz]e|go through|read|see|figure out|determine|measure|profile|reproduce)\b/i;

/** "…and fix it", "…, then update the tests": a change asked for after the looking. */
const THEN_CHANGE = new RegExp(`(?:\\band\\b|\\bthen\\b|\\bso\\b|[,;&])\\s*(?:then\\s+|also\\s+|please\\s+|just\\s+)*${CHANGE_HEAD.source.slice(1)}`, "i");

/** Nothing to act on: "fix it", "do that", "apply them". The runner would have no idea what is meant. */
const ONLY_PRONOUN = /^(it|this|that|them|these|those|things?|stuff|everything|all|the same)?\s*(now|please|up|again|too|for me|asap|quickly)?[\s.!]*$/i;

function normalise(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();
}

/** What the user is asking PawOS to do with this message. */
export function classifyIntent(text: string): IntentDecision {
  const said = normalise(text);
  if (!said) return chat("empty");
  if (GREETING.test(said)) return chat("greeting");
  if (NO_CHANGE.test(said)) return chat("no_change_wanted");

  const opening = said.replace(FILLER, "");
  const asked = opening.replace(ASK_YOU, "");
  const politely = asked !== opening; // "can you…", "please…", "I want you to…", "go ahead and…"
  const core = asked.replace(FILLER, "");

  // Words, not work — however it is phrased: "explain how to fix…", "can you tell me which files…".
  if (EXPLAIN_HEAD.test(core)) return chat("explanation");
  // A question asks for an answer. "Can you fix…?" is not one: it is a request, and was unwrapped above.
  if (!politely && QUESTION_START.test(opening)) return chat("question");

  const change = CHANGE_HEAD.exec(core);
  if (change) {
    // "add dark mode?" — said as a question, so it is one: the user is asking, not telling.
    if (said.endsWith("?") && !politely) return chat("question");
    if (ONLY_PRONOUN.test(core.slice(change[0].length).trim())) return chat("unspecific");
    return task(politely ? "request" : "directive");
  }
  if (LOOK_HEAD.test(core)) {
    // "run the tests and fix the failures", "find and fix the bug": the looking leads to a change.
    return THEN_CHANGE.test(core) && !said.endsWith("?") ? task(politely ? "request" : "directive") : chat("investigation");
  }
  if (!core) return chat("unspecific"); // "go ahead", "please"
  if (said.endsWith("?")) return chat("question");
  return chat("statement");
}

export const isTask = (text: string): boolean => classifyIntent(text).intent === "task";
