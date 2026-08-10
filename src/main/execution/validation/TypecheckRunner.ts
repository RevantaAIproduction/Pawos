import * as fs from 'fs';
import * as path from 'path';
import { execShellCommand } from '../shellExec';
import type { ValidationStepResult } from './ValidationReportTypes';

const TYPECHECK_TIMEOUT_MS = 120_000;

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Coding Runtime V2, Validation Pipeline (§12) — prefers `package.json` `scripts.typecheck` over a
 * conservative inferred fallback (`npx tsc --noEmit`, only attempted when a real `tsconfig.json`
 * exists), skipping honestly when neither exists (a plain-JavaScript project with no TypeScript
 * config has nothing real to typecheck).
 */
export async function runTypecheck(root: string): Promise<ValidationStepResult> {
  const pkg = readJson(path.join(root, 'package.json'));
  const typecheckScript = pkg?.scripts?.typecheck as string | undefined;
  const hasTsconfig = fs.existsSync(path.join(root, 'tsconfig.json'));

  const command = typecheckScript ? 'npm run typecheck' : hasTsconfig ? 'npx tsc --noEmit' : null;
  if (!command) {
    return { status: 'skipped', skippedReason: 'No typecheck script in package.json and no tsconfig.json found.' };
  }

  const start = Date.now();
  const result = await execShellCommand(command, root, undefined, TYPECHECK_TIMEOUT_MS);
  const durationMs = Date.now() - start;
  const source = typecheckScript ? 'packageScript' : 'inferred';

  if (result.timedOut) {
    return { status: 'failed', source, command, durationMs, errorDetail: `Typecheck timed out after ${TYPECHECK_TIMEOUT_MS / 1000}s.` };
  }
  if (result.code !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().slice(-1000);
    return { status: 'failed', source, command, durationMs, errorDetail: tail || `Typecheck exited with code ${result.code}.` };
  }
  return { status: 'passed', source, command, durationMs };
}
