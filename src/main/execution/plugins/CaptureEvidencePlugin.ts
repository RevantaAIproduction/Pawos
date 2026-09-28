import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { evidenceCaptureService, type EvidenceCaptureService } from '../../evidence/EvidenceCaptureService';
import { detectAppKinds, PROVIDER_FOR_APP_KIND } from '../../evidence/detectAppKinds';
import { entitlementService } from '../../billing/EntitlementService';

/**
 * captureEvidence / checkEvidenceCapture — optional before/after ticket evidence (see src/main/evidence).
 * An environment that can't capture (no adb, not macOS, no window) returns ok with `unavailable` so the
 * run notes it and carries on: evidence is never what decides whether a ticket succeeds or is billed.
 */
export class CaptureEvidencePlugin extends BasePlugin {
  id = 'captureEvidence';

  constructor(private readonly service: EvidenceCaptureService = evidenceCaptureService, private readonly canRunCommands: () => boolean = () => entitlementService.isFeatureAvailable('advancedRuntimes')) {
    super();
  }

  canHandle(request: ActionRequest): boolean {
    return request.type === 'captureEvidence' || request.type === 'checkEvidenceCapture';
  }

  requirements(request: ActionRequest) {
    // Output evidence runs a command — the same plan gate as runCommand.
    if (request.type === 'captureEvidence' && request.target.provider === 'output' && 'command' in request.target && !this.canRunCommands()) {
      return [{ id: 'coding-not-in-plan', message: 'Running commands for output evidence needs a plan with coding execution.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type === 'checkEvidenceCapture') {
      const providers = await this.service.availability();
      const appKinds = request.projectFolder ? detectAppKinds(request.projectFolder) : [];
      return {
        ok: true,
        data: {
          appKinds,
          suggestedProviders: appKinds.map((kind) => PROVIDER_FOR_APP_KIND[kind]),
          providers,
        },
      };
    }
    if (request.type !== 'captureEvidence') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const outcome = await this.service.capture({
      phase: request.phase,
      label: request.label,
      target: request.target,
      ...(request.autonomousRunId ? { runId: request.autonomousRunId } : {}),
    });
    if (outcome.ok) return { ok: true, data: outcome.data };
    if (outcome.unavailable) {
      return {
        ok: true,
        data: {
          unavailable: true,
          message: `${outcome.message} Evidence is optional — continue the ticket without it and mention that it couldn't be captured.`,
        },
      };
    }
    return { ok: false, reason: 'failed', message: outcome.message };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type === 'checkEvidenceCapture') return 'Checking what evidence I can capture…';
    return request.type === 'captureEvidence' && request.target.provider === 'output' ? 'Capturing the output…' : 'Taking a screenshot…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type === 'checkEvidenceCapture') return 'Checked.';
    const data = result.data as { unavailable?: boolean } | undefined;
    if (data?.unavailable) return "Couldn't capture evidence here — carrying on without it.";
    return request.type === 'captureEvidence' && request.target.provider === 'output' ? 'Captured the output.' : 'Captured.';
  }
}

export const captureEvidencePlugin = new CaptureEvidencePlugin();
