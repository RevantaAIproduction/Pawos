import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult, CommandShell } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { getRefreshedEnv } from '../envRefresh';
import { firstToken, isAllowedPrefix, allowedPrefixesList } from './commandSafety';
import { withShell } from './shellCommand';
import { looksLikeTestCommand, parseTestOutput } from '../TestResultParser';

const TIMEOUT_MS = 45_000;
const OUTPUT_PREVIEW_LENGTH = 300;
const MAX_OUTPUT_CHARS = 8_000;

function isAllowed(command: string): boolean {
  return isAllowedPrefix(command);
}

/** True for the install-style commands where checking node_modules afterward is a real, cheap way to verify — not a fabricated check for the rest. */
function looksLikeInstall(command: string): boolean {
  return /\b(npm|yarn|pnpm)\b.*\b(install|i|add|ci)\b/i.test(command);
}

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

async function runCommand(command: string, cwd: string, shell?: CommandShell): Promise<RunResult> {
  // Refreshed env — a PATH/env change from earlier in this same conversation
  // (setPathEntry, setEnvironmentVariable, installTool) must be visible to
  // the very next command, not just after an app restart. See envRefresh.ts.
  const env = await getRefreshedEnv();
  return new Promise((resolve) => {
    const child = exec(withShell(command, shell), { cwd, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 * 4, env }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error as unknown as { code?: number }).code ?? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        timedOut: Boolean(error && (error as unknown as { killed?: boolean; signal?: string }).signal === 'SIGTERM'),
      });
    });
    void child;
  });
}

export class RunCommandPlugin extends BasePlugin {
  id = 'runCommand';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'runCommand';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'runCommand') return [];
    if (!isAllowed(request.command)) {
      return [
        {
          id: 'command-not-allowed',
          message: `I can only run ${allowedPrefixesList()} commands right now — "${firstToken(request.command)}" isn't one of those.`,
        },
      ];
    }
    if (!fs.existsSync(request.cwd)) {
      return [{ id: 'cwd-missing', message: `I can't find the folder "${request.cwd}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'runCommand') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isAllowed(request.command)) return { ok: false, reason: 'not-implemented' };

    const result = await runCommand(request.command, request.cwd, request.shell);
    const combined = `${result.stdout}\n${result.stderr}`.trim().slice(-MAX_OUTPUT_CHARS);
    const isTestCommand = looksLikeTestCommand(request.command);
    const testResults = isTestCommand ? parseTestOutput(combined, result.code) : undefined;

    if (result.timedOut) {
      return {
        ok: false,
        reason: 'failed',
        message: `Still running after ${TIMEOUT_MS / 1000}s — it may be a long-running process (like a dev server) rather than one that finishes on its own.`,
      };
    }
    if (result.code !== 0) {
      return {
        ok: false,
        reason: 'failed',
        message: combined || `Exited with code ${result.code}.`,
        data: isTestCommand ? { command: request.command, cwd: request.cwd, output: combined, testResults } : undefined,
      };
    }
    return { ok: true, data: { command: request.command, cwd: request.cwd, output: combined, ...(isTestCommand ? { testResults } : {}) } };
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'runCommand' || !result.ok) return result;
    // A real, cheap check for install-style commands — not fabricated for
    // commands where there's nothing honest to verify beyond the exit code.
    if (looksLikeInstall(request.command)) {
      const nodeModulesPath = path.join(request.cwd, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        return { ok: false, reason: 'failed', message: 'The command exited successfully, but node_modules still isn’t there — the install may not have actually happened.' };
      }
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'runCommand') return 'Working on that…';
    return `Running \`${request.command}\`…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'runCommand') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `This will run \`${request.command}\` in ${request.cwd}. Should I go ahead?`;
      }
      return describeFailure(result);
    }
    const data = result.data as { output?: string } | undefined;
    const output = data?.output?.trim();
    const preview = output ? output.slice(-OUTPUT_PREVIEW_LENGTH) : '';
    return preview ? `I ran \`${request.command}\`. Here's the tail of the output:\n${preview}` : `I ran \`${request.command}\`.`;
  }
}

export const runCommandPlugin = new RunCommandPlugin();
