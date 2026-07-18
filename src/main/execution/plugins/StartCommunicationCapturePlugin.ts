import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';
import { communicationSourceRegistry } from '../../communication/CommunicationSourceRegistry';

/**
 * Begins a real communication capture — for face-to-face meetings and
 * voice notes this only creates the CommunicationRecord and opens its
 * folder; the actual mic/system-audio bytes are captured in the renderer
 * (CommunicationAudioCapture.ts) and streamed back via saveAudioChunk, same
 * separation as everywhere else in this app where the renderer owns
 * getUserMedia/MediaRecorder and the main process owns storage.
 */
export class StartCommunicationCapturePlugin extends BasePlugin {
  id = 'startCommunicationCapture';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'startCommunicationCapture';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'startCommunicationCapture') return [];
    if (!communicationSourceRegistry.has(request.medium)) {
      return [{ id: 'unknown-medium', message: `"${request.medium}" isn't a known communication source.` }];
    }
    // Real, recorded consent — a separate question from the generic
    // "confirm this destructive action" gate, required only for meeting
    // and phone-call sources (never face-to-face/voice notes, where the
    // user is recording their own conversation by their own command).
    if (communicationRuntime.requiresConsent(request.medium) && !request.consentConfirmed) {
      const isPhone = request.medium === 'phoneCall';
      const message = isPhone
        ? 'Do you have permission from the other party to record this call?'
        : 'Do you have consent from the other meeting participants to record this?';
      return [{ id: 'consent-required', message }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'startCommunicationCapture') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await communicationRuntime.startCapture({ medium: request.medium, title: request.title, consentConfirmed: request.consentConfirmed });
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: result.data };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'startCommunicationCapture') return 'Starting recording…';
    const descriptor = communicationSourceRegistry.get(request.medium);
    return `Starting to record your ${descriptor?.displayName.toLowerCase() ?? 'conversation'}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'startCommunicationCapture') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    // Desktop capture is the primary, confident default — never framed as
    // an apologetic fallback. meetingParticipant is only ever reported when
    // a real bot-join genuinely happened (not attempted by default today).
    const record = communicationRuntime.getCommunication((result.data as { communicationId?: string } | undefined)?.communicationId ?? '');
    if (record?.recordingMode === 'meetingParticipant') {
      return 'I\'ve joined the meeting as Paw AI Assistant and started recording. Say "stop" when you\'re done.';
    }
    if (record?.recordingMode === 'desktopCapture') {
      return 'I\'m recording this meeting\'s audio from your desktop. Say "stop" when you\'re done.';
    }
    return "I've started recording. Say \"stop\" when you're done.";
  }
}

export const startCommunicationCapturePlugin = new StartCommunicationCapturePlugin();
