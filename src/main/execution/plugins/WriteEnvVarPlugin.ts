import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { upsertEnvVar, parseEnvKeys } from './envFile';

/** A structured key=value upsert — never a raw whole-file overwrite, so every other line (comments, other vars) survives untouched. Destructive: it can alter secrets/behavior. */
export class WriteEnvVarPlugin extends BasePlugin {
  id = 'writeEnvVar';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'writeEnvVar';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'writeEnvVar') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const existing = fs.existsSync(request.path) ? await fs.promises.readFile(request.path, 'utf-8') : '';
      const updated = upsertEnvVar(existing, request.key, request.value);
      await fs.promises.mkdir(path.dirname(request.path), { recursive: true });
      await fs.promises.writeFile(request.path, updated, 'utf-8');
      return { ok: true, data: { key: request.key } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'writeEnvVar' || !result.ok) return result;
    try {
      const content = await fs.promises.readFile(request.path, 'utf-8');
      if (!parseEnvKeys(content).includes(request.key)) {
        return { ok: false, reason: 'failed', message: 'The write reported success, but the key isn\'t actually in the file.' };
      }
      return result;
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Wrote the file but couldn't confirm it afterward: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'writeEnvVar') return 'Working on that…';
    return `Setting ${request.key}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'writeEnvVar') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will set ${request.key} in ${request.path}. Should I go ahead?`;
      return describeFailure(result);
    }
    return `I've set ${request.key}.`;
  }
}

export const writeEnvVarPlugin = new WriteEnvVarPlugin();
