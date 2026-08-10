import * as fs from 'fs';
import * as path from 'path';
import { execShellCommand } from '../shellExec';
import type { ValidationStepResult } from './ValidationReportTypes';

const LINT_TIMEOUT_MS = 120_000;
const ESLINT_CONFIG_NAMES = ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function hasEslintConfig(root: string): boolean {
  return ESLINT_CONFIG_NAMES.some((name) => fs.existsSync(path.join(root, name)));
}

/**
 * Coding Runtime V2, Validation Pipeline (§12) — prefers the project's own `package.json`
 * `scripts.lint` (real, project-declared intent) over a conservative inferred fallback (`npx eslint
 * .`, only attempted when a real ESLint config file exists), and skips honestly — never fabricating
 * a "passed" — when neither exists.
 */
export async function runLint(root: string): Promise<ValidationStepResult> {
  const pkg = readJson(path.join(root, 'package.json'));
  const lintScript = pkg?.scripts?.lint as string | undefined;

  const command = lintScript ? 'npm run lint' : hasEslintConfig(root) ? 'npx eslint .' : null;
  if (!command) {
    return { status: 'skipped', skippedReason: 'No lint script in package.json and no ESLint config file found.' };
  }

  const start = Date.now();
  const result = await execShellCommand(command, root, undefined, LINT_TIMEOUT_MS);
  const durationMs = Date.now() - start;
  const source = lintScript ? 'packageScript' : 'inferred';

  if (result.timedOut) {
    return { status: 'failed', source, command, durationMs, errorDetail: `Lint timed out after ${LINT_TIMEOUT_MS / 1000}s.` };
  }
  if (result.code !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().slice(-1000);
    return { status: 'failed', source, command, durationMs, errorDetail: tail || `Lint exited with code ${result.code}.` };
  }
  return { status: 'passed', source, command, durationMs };
}
