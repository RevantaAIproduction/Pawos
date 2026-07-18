import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { setSystemEnvVar } from './systemEnvWriter';

type SetEnvSuccessData = { name: string; scope: 'machine' | 'user'; elevated: boolean; alreadySet: boolean };

const SAFE_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_VAR_VALUE = /^[^\r\n]*$/;

/**
 * Generic environment variable setter — writes real Windows System
 * (Machine) scope by default, requesting UAC elevation when required (see
 * systemEnvWriter.ts). Works for any named variable (JAVA_HOME,
 * ANDROID_HOME, GOPATH, ...); no per-application data. Name and value are
 * passed through child-process env indirection, never string-interpolated
 * into the PowerShell script, so no value can inject a second command.
 */
export class SetEnvironmentVariablePlugin extends BasePlugin {
  id = 'setEnvironmentVariable';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setEnvironmentVariable';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'setEnvironmentVariable') return [];
    if (!SAFE_VAR_NAME.test(request.name)) {
      return [{ id: 'name-invalid', message: `"${request.name}" isn't a valid environment variable name.` }];
    }
    if (!SAFE_VAR_VALUE.test(request.value)) {
      return [{ id: 'value-invalid', message: "That value contains characters I won't set." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setEnvironmentVariable') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_VAR_NAME.test(request.name) || !SAFE_VAR_VALUE.test(request.value)) {
      return { ok: false, reason: 'failed', message: 'Invalid environment variable name or value.' };
    }

    const result = await setSystemEnvVar(request.name, request.value, { preferredScope: request.preferredScope });
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { name: request.name, ...result } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'setEnvironmentVariable') return 'Working on that…';
    return `Setting ${request.name}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setEnvironmentVariable') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as SetEnvSuccessData | undefined;
    if (!data) return 'Done.';
    const scopeLabel = data.scope === 'machine' ? 'system-wide' : 'for your Windows account only';
    if (data.alreadySet) return `${data.name} was already set to that value (${scopeLabel}).`;
    const elevationNote = data.elevated ? ' — administrator permission was granted for this.' : '';
    return `I've set ${data.name} ${scopeLabel}${elevationNote}`;
  }
}

export const setEnvironmentVariablePlugin = new SetEnvironmentVariablePlugin();
