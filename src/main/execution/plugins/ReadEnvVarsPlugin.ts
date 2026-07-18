import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { parseEnvKeys } from './envFile';

/** Returns key NAMES only, never values — see ActionTypes.ts's readEnvVars comment for why. */
export class ReadEnvVarsPlugin extends BasePlugin {
  id = 'readEnvVars';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readEnvVars';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'readEnvVars') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'file-missing', message: `I can't find "${request.path}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'readEnvVars') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.path)) return { ok: false, reason: 'failed', message: `"${request.path}" doesn't exist.` };
    try {
      const content = await fs.promises.readFile(request.path, 'utf-8');
      return { ok: true, data: { keys: parseEnvKeys(content) } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Checking environment variables…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'readEnvVars') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { keys: string[] } | undefined;
    const count = data?.keys.length ?? 0;
    return count === 0 ? 'No environment variables set there.' : `Found ${count} variable${count === 1 ? '' : 's'}: ${data!.keys.join(', ')}.`;
  }
}

export const readEnvVarsPlugin = new ReadEnvVarsPlugin();
