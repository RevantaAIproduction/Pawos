/**
 * Shared allowlist logic for anything that runs a shell command — RunCommandPlugin
 * and StartProcessPlugin both gate on this. Extracted from RunCommandPlugin's
 * original inline prefix check so both plugins stay in lockstep instead of
 * drifting into two separate allowlists. Includes AI CLI workers (claude/
 * codex/gemini/ollama) alongside dev-tool prefixes — Paw treats them as just
 * more interchangeable workers it can reach for, not a special category.
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
