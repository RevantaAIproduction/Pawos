import * as fs from 'fs';
import * as path from 'path';
import { execShellCommand } from '../shellExec';
import { parseTestOutput } from '../TestResultParser';
import type { ValidationStepResult } from './ValidationReportTypes';

const TEST_TIMEOUT_MS = 120_000;

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Coding Runtime V2, Validation Pipeline (§12) — only runs the project's own declared
 * `package.json` `scripts.test` (never an inferred fallback — guessing a test command for a project
 * with none declared risks running something destructive or meaningless), parsed with the exact same
 * `TestResultParser.parseTestOutput()` RunCommandPlugin already uses for real pass/fail counts.
 */
export async function runTestsCheck(root: string): Promise<ValidationStepResult> {
  const pkg = readJson(path.join(root, 'package.json'));
  const testScript = pkg?.scripts?.test as string | undefined;
  if (!testScript) {
    return { status: 'skipped', skippedReason: 'No test script found in package.json.' };
  }

  const start = Date.now();
  const result = await execShellCommand('npm test', root, undefined, TEST_TIMEOUT_MS);
  const durationMs = Date.now() - start;

  if (result.timedOut) {
    return { status: 'failed', source: 'packageScript', command: 'npm test', durationMs, errorDetail: `Tests timed out after ${TEST_TIMEOUT_MS / 1000}s.` };
  }

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  const parsed = parseTestOutput(combined, result.code);
  return {
    status: parsed.status === 'passed' ? 'passed' : 'failed',
    source: 'packageScript',
    command: 'npm test',
    durationMs,
    errorDetail: parsed.failureDetail,
    passed: parsed.passed,
    failed: parsed.failed,
    total: parsed.total,
  };
}
