import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** Desktop side of QR pairing (architecture doc §13.1) — generates a real, single-use pairing token for the mobile companion app to present back. Honest limitation: no mobile client exists in this codebase yet to complete the handshake (explicitly deferred in the frozen architecture), so this only ever produces the token/desktop-registry half. */
export class BeginMobilePairingPlugin extends BasePlugin {
  id = 'beginMobilePairing';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'beginMobilePairing';
  }

  async execute(): Promise<ActionResult> {
    const result = communicationRuntime.beginPairing();
    return result.ok ? { ok: true, data: result.data } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Generating a pairing code…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'beginMobilePairing') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've generated a pairing code — scan it from the Paw mobile app to pair your phone." : describeFailure(result);
  }
}

export const beginMobilePairingPlugin = new BeginMobilePairingPlugin();
