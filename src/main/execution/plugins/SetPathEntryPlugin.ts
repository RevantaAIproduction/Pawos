import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { addSystemPathEntry } from './systemEnvWriter';

type SetPathSuccessData = { entry: string; scope: 'machine' | 'user'; elevated: boolean; alreadySet: boolean };

/** No shell metacharacters — this string is embedded directly into a PowerShell command. */
const SAFE_PATH_ENTRY = /^[^;&|`$()<>"']+$/;

/**
 * Adds a folder to real Windows System (Machine) PATH by default,
 * requesting UAC elevation when required (see systemEnvWriter.ts) — "leave
 * the computer correctly configured," not scoped so narrowly it only works
 * for whichever Windows account happened to be logged in. Never silently
 * downgrades to User scope on its own; see systemEnvWriter's decision
 * message when elevation isn't available.
 */
export class SetPathEntryPlugin extends BasePlugin {
  id = 'setPathEntry';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setPathEntry';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'setPathEntry') return [];
    if (!SAFE_PATH_ENTRY.test(request.entry)) {
      return [{ id: 'entry-invalid', message: `"${request.entry}" contains characters I won't add to PATH.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setPathEntry') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!SAFE_PATH_ENTRY.test(request.entry)) return { ok: false, reason: 'failed', message: 'Invalid PATH entry.' };

    const result = await addSystemPathEntry(request.entry, { preferredScope: request.preferredScope });
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { entry: request.entry, ...result } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'setPathEntry') return 'Working on that…';
    return `Adding "${request.entry}" to PATH…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setPathEntry') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as SetPathSuccessData | undefined;
    if (!data) return 'Done.';
    const scopeLabel = data.scope === 'machine' ? 'system-wide' : 'for your Windows account only';
    if (data.alreadySet) return `"${data.entry}" was already on PATH (${scopeLabel}).`;
    const elevationNote = data.elevated ? ' — administrator permission was granted for this.' : '';
    return `I've added "${data.entry}" to PATH ${scopeLabel}${elevationNote}. You may need to restart apps for it to take effect.`;
  }
}

export const setPathEntryPlugin = new SetPathEntryPlugin();
