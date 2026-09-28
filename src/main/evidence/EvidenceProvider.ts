import type { EvidenceCaptureRequest, EvidenceProviderAvailability, EvidenceProviderId, OutputEvidence } from '../../shared/evidence/EvidenceTypes';

/** What a provider hands back; EvidenceCaptureService saves it and builds the EvidenceItem. */
export type ProviderCapture =
  | {
      ok: true;
      targetDescription: string;
      image?: Buffer;
      output?: OutputEvidence;
      pageSignals?: { title: string; consoleErrors: string[]; failedRequests: string[] };
    }
  /** unavailable = the environment can't capture (no adb, not macOS, no window) — never a ticket failure. */
  | { ok: false; unavailable: boolean; message: string };

/** One way of capturing evidence — web page, app window, device screen, or command/API output. */
export interface EvidenceProvider {
  readonly id: EvidenceProviderId;
  availability(): Promise<EvidenceProviderAvailability>;
  capture(request: EvidenceCaptureRequest): Promise<ProviderCapture>;
}

export const unavailable = (message: string): ProviderCapture => ({ ok: false, unavailable: true, message });
export const failed = (message: string): ProviderCapture => ({ ok: false, unavailable: false, message });
