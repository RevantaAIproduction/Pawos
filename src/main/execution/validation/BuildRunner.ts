import * as fs from 'fs';
import * as path from 'path';
import { execShellCommand } from '../shellExec';
import { findBuildOutputDir } from '../plugins/BuildProjectPlugin';
import type { ValidationStepResult } from './ValidationReportTypes';

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

function readJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Coding Runtime V2, Validation Pipeline (§12) — only ever runs the project's own declared
 * `package.json` `scripts.build`, never an inferred fallback: unlike lint/typecheck, there is no
 * safe, framework-agnostic default build command, so a missing script is honestly skipped rather
 * than guessed at. Reuses `findBuildOutputDir()` (BuildProjectPlugin.ts) for the same real,
 * non-fabricated post-build evidence BuildProjectPlugin itself already relies on.
 */
export async function runBuildCheck(root: string): Promise<ValidationStepResult> {
  const pkg = readJson(path.join(root, 'package.json'));
  const buildScript = pkg?.scripts?.build as string | undefined;
  if (!buildScript) {
    return { status: 'skipped', skippedReason: 'No build script found in package.json.' };
  }

  const start = Date.now();
  const result = await execShellCommand('npm run build', root, undefined, BUILD_TIMEOUT_MS);
  const durationMs = Date.now() - start;

  if (result.timedOut) {
    return { status: 'failed', source: 'packageScript', command: 'npm run build', durationMs, errorDetail: `Build timed out after ${BUILD_TIMEOUT_MS / 1000}s.` };
  }
  if (result.code !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().slice(-1000);
    return { status: 'failed', source: 'packageScript', command: 'npm run build', durationMs, errorDetail: tail || `Build exited with code ${result.code}.` };
  }
  if (!findBuildOutputDir(root)) {
    return {
      status: 'failed',
      source: 'packageScript',
      command: 'npm run build',
      durationMs,
      errorDetail: 'The build command exited successfully, but no build output folder (.next/dist/build/out) appeared.',
    };
  }
  return { status: 'passed', source: 'packageScript', command: 'npm run build', durationMs };
}
