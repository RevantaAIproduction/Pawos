/**
 * Deterministic heuristic to detect whether a user request is actionable
 * (requires hands-on or autonomous execution strategy) vs informational
 * (pure question or explanation).
 *
 * Uses multiple signals rather than keyword-only matching to avoid brittleness.
 * Does NOT use ML classification or a second model call.
 */

import type { WindowContext } from './ConversationTypes';

/**
 * Actionable verbs that suggest the user is asking PawOS to DO something.
 */
const ACTIONABLE_VERBS = [
  'build',
  'create',
  'implement',
  'fix',
  'change',
  'refactor',
  'deploy',
  'update',
  'make',
  'add',
  'remove',
  'integrate',
  'configure',
  'upgrade',
  'optimize',
  'migrate',
  'design',
  'rewrite',
  'reorganize',
  'restructure',
  'improve',
];

/**
 * Question starters that indicate the user is asking FOR INFORMATION, not requesting action.
 */
const QUESTION_STARTERS = [
  'what ',
  'can you explain',
  'why ',
  'how do i',
  'how do you',
  'what is',
  'what are',
  'what would',
  'how does',
  'does ',
  'should i',
  'could you explain',
];

/**
 * Conditional/hypothetical language that suggests a question, not an action request.
 */
const CONDITIONAL_PHRASES = [
  'what if',
  'what would happen if',
  'would it be better',
  'could we',
  'can we',
];

/**
 * Determine whether to show the execution choice card for a user message.
 *
 * Returns true ONLY when:
 * 1. Request is genuinely actionable
 * 2. User has NOT previously selected an execution strategy
 * 3. Request is not an explicit strategy-change request
 *
 * After the user selects a strategy, this returns false for subsequent actionable requests
 * (they automatically use the remembered strategy).
 *
 * Signals considered for actionability:
 * 1. Message structure (interrogative vs imperative)
 * 2. First word (question starter)
 * 3. Ending punctuation
 * 4. Presence of actionable verbs
 * 5. Conditional/hypothetical language
 * 6. Project/file context
 * 7. Attached assets (images, screenshots)
 */
export function shouldShowExecutionChoice(
  message: string,
  windowContext: WindowContext,
  hasAttachedImages: boolean,
  hasSelectedFileContext: boolean,
  hasExistingStrategy: boolean = false,
  isStrategyChangeRequest: boolean = false
): boolean {
  // If user already has a strategy stored, never show the choice card
  // (actionable requests will automatically use the stored strategy)
  if (hasExistingStrategy && !isStrategyChangeRequest) {
    return false;
  }

  // If this is an explicit strategy change, don't show the choice card
  // (the strategy change handler will update the strategy directly)
  if (isStrategyChangeRequest) {
    return false;
  }
  if (!message || !message.trim()) return false;

  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // SIGNAL 1 & 2: Question handling
  // Questions that START with question-words ("What", "Can you explain", etc.) are
  // informational - user is asking FOR information, not requesting work.
  if (startsWithQuestionPhrase(lower)) {
    return false; // e.g., "What do you think of this design?" - informational
  }

  // Questions that END with ? but start with imperative/actionable phrasing are
  // actionable commands phrased politely: "Recreate this from the screenshot?"
  if (trimmed.endsWith('?')) {
    // Check if it starts with an actionable verb (e.g., "Recreate this...?")
    if (containsActionableVerb(lower)) {
      // Imperative phrased as question with assets = actionable
      if ((hasAttachedImages || hasSelectedFileContext || windowContext.project)) {
        return true; // e.g., "Recreate this design from the screenshot?"
      }
    }
    return false; // Other ending-with-? are questions
  }

  // SIGNAL 3: Conditional/hypothetical language usually means information request
  if (containsConditionalPhrase(lower)) {
    return false; // e.g., "What if I changed the auth flow?"
  }

  // SIGNAL 4: Actionable verb suggests user is requesting work
  if (containsActionableVerb(lower)) {
    return true; // e.g., "Change the navbar"
  }

  // SIGNAL 5: Project/file context + actionable structure
  if ((windowContext.project || hasSelectedFileContext) && looksImperative(trimmed)) {
    return true; // e.g., "Use the button component"
  }

  // SIGNAL 6: Images/screenshots + imperative structure + actionable verb
  // Requires actionable verb to avoid false positives like "Analyze this screenshot"
  if (hasAttachedImages && looksImperative(trimmed) && containsActionableVerb(lower)) {
    return true; // e.g., "Build this from the screenshot"
  }

  // Default: if no clear signal, don't show choice
  return false;
}

/**
 * Check if message starts with a known question/informational marker.
 */
function startsWithQuestionPhrase(lower: string): boolean {
  return QUESTION_STARTERS.some((starter) => lower.startsWith(starter));
}

/**
 * Check if message contains conditional/hypothetical language.
 */
function containsConditionalPhrase(lower: string): boolean {
  return CONDITIONAL_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * Check if message contains an actionable verb.
 */
function containsActionableVerb(lower: string): boolean {
  return ACTIONABLE_VERBS.some((verb) => {
    // Match as whole word or after space
    const pattern = new RegExp(`\\b${verb}\\b`);
    return pattern.test(lower);
  });
}

/**
 * Heuristic: does the message look like an imperative command?
 * Checks for: starts with capital letter + looks like a sentence
 */
function looksImperative(message: string): boolean {
  if (message.length < 2) return false;
  if (!/^[A-Z]/.test(message)) return false;
  // Ends with period or is short command
  return message.endsWith('.') || message.length < 100;
}

/**
 * Detect if the message is an explicit request to change execution strategy.
 *
 * Conservative detection: only clear, direct strategy-change statements.
 * Does NOT interpret speculation or questions about strategy as actual changes.
 *
 * Checks:
 * 1. Message does NOT start with question words ("What", "Can", "Could")
 * 2. Message does NOT contain conditional language ("What if", "Could we")
 * 3. Message DOES contain a direct strategy-change phrase
 */
export function detectStrategyChange(message: string): 'handsOn' | 'autonomous' | null {
  const lower = message.toLowerCase().trim();

  // Reject questions and conditionals immediately
  if (
    lower.startsWith('what ') ||
    lower.startsWith('can ') ||
    lower.startsWith('could ') ||
    lower.startsWith('why ') ||
    lower.startsWith('how ') ||
    lower.includes('what if') ||
    lower.includes('could we')
  ) {
    return null;
  }

  // Strategy change to AUTONOMOUS (must be direct/imperative statements)
  const autonomousPhrases = [
    'switch to autonomous',
    'use autonomous mode',
    'do this autonomously',
    'autonomously from now',
    'work autonomously',
    'autonomous execution',
    'autonomous mode from',
  ];

  if (autonomousPhrases.some((phrase) => lower.includes(phrase))) {
    return 'autonomous';
  }

  // Strategy change to HANDS-ON (must be direct/imperative statements)
  const handsOnPhrases = [
    'switch to hands-on',
    'switch back to hands-on',
    'use hands-on',
    'work with me',
    'work together',
    'hands-on mode',
    'switch back to hands',
  ];

  if (handsOnPhrases.some((phrase) => lower.includes(phrase))) {
    return 'handsOn';
  }

  return null;
}
