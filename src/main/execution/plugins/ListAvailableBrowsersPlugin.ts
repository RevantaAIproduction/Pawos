import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/** "Paw should detect what browsers exist on the user's computer" — real capability detection, not a guess. */
export class ListAvailableBrowsersPlugin extends BasePlugin {
  id = 'listAvailableBrowsers';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listAvailableBrowsers';
  }

  async execute(): Promise<ActionResult> {
    const browsers = await browserRuntime.listAvailableBrowsers();
    return { ok: true, data: { browsers } };
  }

  describeInProgress(): string {
    return 'Checking which browsers are installed…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { browsers?: { displayName: string; installed: boolean }[] } | undefined;
    const installed = data?.browsers?.filter((b) => b.installed).map((b) => b.displayName) ?? [];
    return installed.length > 0 ? `I can use: ${installed.join(', ')}.` : "I couldn't find any real browsers installed — I'll use my own.";
  }
}

export const listAvailableBrowsersPlugin = new ListAvailableBrowsersPlugin();
