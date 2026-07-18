import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

const PLANNED_TYPES: ActionRequest['type'][] = [
  'setVolume',
  'arrangeWindows',
  'findBluetoothDevices',
  'findWifiNetworks',
  'startMeeting',
];

/**
 * Catch-all for request types accepted by the type system so callers can be
 * written against them now, but with no real OS integration wired yet
 * (volume/Bluetooth/Wi-Fi/window-arrangement/meetings need native modules
 * this project doesn't have). Honestly reports not-implemented instead of
 * silently doing nothing or pretending to succeed.
 */
export class NotImplementedPlugin extends BasePlugin {
  id = 'notImplemented';

  canHandle(request: ActionRequest): boolean {
    return PLANNED_TYPES.includes(request.type);
  }

  async execute(_request: ActionRequest): Promise<ActionResult> {
    return { ok: false, reason: 'not-implemented' };
  }

  describeInProgress(_request: ActionRequest): string {
    return 'Working on that…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return !result.ok ? describeFailure(result) : 'Done.';
  }
}

export const notImplementedPlugin = new NotImplementedPlugin();
