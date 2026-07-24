/**
 * Shared classification + natural-language narration for automatic
 * recovery, used by both DesktopExecutionEngine's recover() loop (main
 * process) and ConversationRuntime's reasoning-turn retry (renderer) so
 * "PawOS is fixing something" always sounds the same regardless of which
 * layer is doing the recovering. This extends the existing recovery
 * architecture (DesktopPlugin.recover(), ConversationRuntime's Recovery
 * Policy) rather than introducing a separate watchdog — see
 * DesktopExecutionEngine.ts and ConversationRuntime.ts for where it's used.
 */

export type RecoveryFailureClass =
  | 'aiProvider'
  | 'rateLimit'
  | 'network'
  | 'browserCrash'
  | 'gitConflict'
  | 'fileConflict'
  | 'deployment'
  | 'ciCd'
  | 'timeout'
  | 'missingDependency'
  | 'permission'
  | 'memoryPressure'
  | 'generic';

/**
 * Classes where a generic, content-blind retry genuinely cannot help —
 * the failure requires a real decision (which side of a merge conflict to
 * keep) or a permission the user must grant. DesktopExecutionEngine skips
 * its recover() loop entirely for these rather than burning attempts on a
 * retry that was never going to succeed, so the model gets the honest
 * failure immediately and can explain + ask instead.
 */
export const NOT_AUTO_RECOVERABLE: ReadonlySet<RecoveryFailureClass> = new Set(['gitConflict', 'permission']);

const FAILURE_PATTERNS: [RegExp, RecoveryFailureClass][] = [
  [/rate.?limit|\b429\b|too many requests/i, 'rateLimit'],
  [/merge conflict|conflicting files|CONFLICT \(/i, 'gitConflict'],
  [/failed to push|non-fast-forward|rejected.*push/i, 'gitConflict'],
  [/permission denied|EACCES|access is denied/i, 'permission'],
  [/ebusy|eperm|resource busy|file.*(locked|in use)/i, 'fileConflict'],
  [/econnreset|etimedout|enotfound|eai_again|network|fetch failed|socket hang up/i, 'network'],
  [/browser.*(closed|crashed)|target closed|session closed|no such window/i, 'browserCrash'],
  [/deploy(ment)? failed|health check failed/i, 'deployment'],
  [/pipeline failed|workflow failed|ci\b.*failed/i, 'ciCd'],
  [/out of memory|enomem|heap out of memory/i, 'memoryPressure'],
  [/command not found|is not recognized|enoent/i, 'missingDependency'],
  [/timed out|\btimeout\b/i, 'timeout'],
  [/gemini|openai|anthropic|whisper|elevenlabs|ollama|reasoning|\bmodel\b/i, 'aiProvider'],
];

export function classifyFailure(message: string | undefined | null): RecoveryFailureClass {
  if (!message) return 'generic';
  for (const [pattern, cls] of FAILURE_PATTERNS) {
    if (pattern.test(message)) return cls;
  }
  return 'generic';
}

const NARRATION: Record<RecoveryFailureClass, string[]> = {
  aiProvider: ["Give me a moment, I'm retrying that...", 'Recovering from a model hiccup, one more try...'],
  rateLimit: ["I hit a rate limit — waiting a moment before trying again...", 'Slowing down and retrying in a moment...'],
  network: ['That looked like a temporary connection issue — retrying...', 'Give me a moment, reconnecting...'],
  browserCrash: ['The browser session closed — reopening it now...', 'Recovering the browser environment...'],
  gitConflict: ["There's a real conflict here I can't resolve on my own — let me explain it and ask how to proceed."],
  fileConflict: ['A file was briefly locked — retrying in a moment...', 'Give me a moment, that file was in use — trying again...'],
  deployment: ["The deploy didn't come up healthy — checking and rolling back if needed...", 'Verifying the deployment and recovering if necessary...'],
  ciCd: ["The pipeline reported a failure — checking whether this is recoverable..."],
  timeout: ['That took longer than expected — retrying...', 'Give me a moment, trying that again...'],
  missingDependency: ["Looks like something's missing — installing it now...", "I'm installing what's needed, then continuing..."],
  permission: ["That needs a permission I don't have — I'll ask you how to proceed rather than guessing."],
  memoryPressure: ['Things are a little tight on memory — freeing some up before continuing...'],
  generic: ["Give me a moment, I'm fixing that...", 'Recovering and trying again...', 'Almost done — retrying the last step...'],
};

/** Picks a narration phrase for the given attempt number (1-based) so repeated attempts don't show the exact same line. */
export function recoveryNarrationFor(message: string | undefined | null, attempt: number): string {
  const options = NARRATION[classifyFailure(message)];
  return options[(attempt - 1) % options.length] ?? options[0] ?? "Give me a moment, I'm fixing that...";
}

export const RECOVERY_SUCCESS_NARRATION = 'Continuing from where I left off...';
