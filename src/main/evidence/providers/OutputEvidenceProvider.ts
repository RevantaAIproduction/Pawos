import * as fs from 'fs';
import type { EvidenceCaptureRequest, EvidenceProviderAvailability } from '../../../shared/evidence/EvidenceTypes';
import { execShellCommand } from '../../execution/shellExec';
import { allowedPrefixesList, findDangerousShellSyntax, firstToken, isAllowedPrefix } from '../../execution/plugins/commandSafety';
import { failed, type EvidenceProvider, type ProviderCapture } from '../EvidenceProvider';

const COMMAND_TIMEOUT_MS = 60_000;
const HTTP_TIMEOUT_MS = 20_000;
/** Enough to show the real failure (the tail is where errors land) without flooding the chat. */
const MAX_OUTPUT_CHARS = 6_000;

function tail(text: string): string {
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  return trimmed.length > MAX_OUTPUT_CHARS ? `…\n${trimmed.slice(-MAX_OUTPUT_CHARS)}` : trimmed;
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Output/log evidence for things with no screen — a failing test, a CLI, a job, a backend error, or a
 * local API's response. It is text evidence and is always labelled as output, never as a screenshot.
 * Commands go through exactly the same allow-list and no-chaining rules as runCommand.
 */
export class OutputEvidenceProvider implements EvidenceProvider {
  readonly id = 'output' as const;

  async availability(): Promise<EvidenceProviderAvailability> {
    return { provider: 'output', available: true, verified: true, detail: 'Command output and local API responses.' };
  }

  async capture(request: EvidenceCaptureRequest): Promise<ProviderCapture> {
    const target = request.target;
    if (target.provider !== 'output') return failed('Not an output target.');

    if ('httpUrl' in target) {
      if (!isLocalUrl(target.httpUrl)) return failed('Output evidence calls only local APIs (localhost / 127.0.0.1).');
      const method = target.method ?? 'GET';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      try {
        const response = await fetch(target.httpUrl, {
          method,
          signal: controller.signal,
          ...(method === 'POST' ? { body: target.body ?? '', headers: { 'Content-Type': 'application/json' } } : {}),
        });
        const text = await response.text().catch(() => '');
        return {
          ok: true,
          targetDescription: `${method} ${target.httpUrl}`,
          output: { source: `${method} ${target.httpUrl}`, status: response.status, text: tail(text) },
        };
      } catch (error) {
        const message = controller.signal.aborted ? `No response after ${HTTP_TIMEOUT_MS / 1000}s.` : error instanceof Error ? error.message : String(error);
        return { ok: true, targetDescription: `${method} ${target.httpUrl}`, output: { source: `${method} ${target.httpUrl}`, status: null, text: message } };
      } finally {
        clearTimeout(timer);
      }
    }

    const { command, cwd } = target;
    if (!isAllowedPrefix(command)) {
      return failed(`Output evidence can only run ${allowedPrefixesList()} commands — "${firstToken(command)}" isn't one of those.`);
    }
    const dangerous = findDangerousShellSyntax(command);
    if (dangerous) return failed(`Can't run that — it contains "${dangerous}". One plain command at a time.`);
    if (!fs.existsSync(cwd)) return failed(`Folder not found: ${cwd}`);

    const result = await execShellCommand(command, cwd, undefined, COMMAND_TIMEOUT_MS);
    return {
      ok: true,
      targetDescription: command,
      output: {
        source: command,
        status: result.code,
        text: tail(`${result.stdout}\n${result.stderr}`) || '(no output)',
        ...(result.timedOut ? { timedOut: true } : {}),
      },
    };
  }
}
