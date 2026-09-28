import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import type {
  EvidenceCaptureData,
  EvidenceCaptureRequest,
  EvidenceItem,
  EvidenceProviderAvailability,
  EvidenceProviderId,
} from '../../shared/evidence/EvidenceTypes';
import type { EvidenceProvider } from './EvidenceProvider';
import { WebEvidenceProvider } from './providers/WebEvidenceProvider';
import { OutputEvidenceProvider } from './providers/OutputEvidenceProvider';
import { DesktopWindowEvidenceProvider } from './providers/DesktopWindowEvidenceProvider';
import { AndroidEvidenceProvider } from './providers/AndroidEvidenceProvider';
import { IosSimulatorEvidenceProvider } from './providers/IosSimulatorEvidenceProvider';

export type EvidenceCaptureOutcome =
  | { ok: true; data: EvidenceCaptureData }
  /** unavailable = this machine can't capture it (never a ticket failure); otherwise the capture itself went wrong. */
  | { ok: false; unavailable: boolean; message: string };

function formatOutputFile(item: Omit<EvidenceItem, 'filePath'>): string {
  const output = item.output!;
  return [
    `PawOS output evidence — ${item.phase}`,
    `Label: ${item.label}`,
    `Source: ${output.source}`,
    `Status: ${output.status ?? 'none'}${output.timedOut ? ' (timed out)' : ''}`,
    `Captured: ${new Date(item.capturedAt).toISOString()}`,
    '',
    output.text,
    '',
  ].join('\n');
}

/**
 * The one entry point for ticket evidence: picks the provider for the target, captures, and saves the
 * result under userData/evidence/<date>/ (a PNG or a .txt, plus a .json describing it so a ticket run
 * record can reference it later). Evidence is optional — an unavailable environment comes back as
 * { unavailable: true } for the caller to note and carry on.
 */
export class EvidenceCaptureService {
  private readonly providers: Map<EvidenceProviderId, EvidenceProvider>;

  constructor(
    providers: EvidenceProvider[] = [
      new WebEvidenceProvider(),
      new OutputEvidenceProvider(),
      new DesktopWindowEvidenceProvider(),
      new AndroidEvidenceProvider(),
      new IosSimulatorEvidenceProvider(),
    ],
    private readonly rootDir: () => string = () => path.join(app.getPath('userData'), 'evidence')
  ) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  /**
   * A captured image by its evidence id — the local cache. Only ids PawOS itself issued (a UUID) and only
   * files inside the evidence folder; never an arbitrary path. Null when not on this computer.
   */
  readImage(evidenceId: string): { base64: string } | null {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId)) return null;
    const root = this.rootDir();
    let days: string[];
    try {
      days = fs.readdirSync(root).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
    } catch {
      return null;
    }
    for (const day of days) {
      for (const phase of ['before', 'after']) {
        const file = path.join(root, day, `${evidenceId}-${phase}.png`);
        if (fs.existsSync(file)) return { base64: fs.readFileSync(file).toString('base64') };
      }
    }
    return null;
  }

  async availability(): Promise<EvidenceProviderAvailability[]> {
    return Promise.all([...this.providers.values()].map((provider) => provider.availability()));
  }

  async capture(request: EvidenceCaptureRequest): Promise<EvidenceCaptureOutcome> {
    const provider = this.providers.get(request.target.provider);
    if (!provider) return { ok: false, unavailable: true, message: `No capture provider for "${request.target.provider}".` };

    let captured;
    try {
      captured = await provider.capture(request);
    } catch (error) {
      return { ok: false, unavailable: false, message: error instanceof Error ? error.message : String(error) };
    }
    if (!captured.ok) return captured;
    if (!captured.image && !captured.output) return { ok: false, unavailable: false, message: 'The capture returned nothing.' };

    const id = randomUUID();
    const capturedAt = Date.now();
    const dir = path.join(this.rootDir(), new Date(capturedAt).toISOString().slice(0, 10));
    fs.mkdirSync(dir, { recursive: true });

    const base: Omit<EvidenceItem, 'filePath'> = {
      id,
      phase: request.phase,
      label: request.label.trim().slice(0, 160) || (request.phase === 'before' ? 'Before' : 'After'),
      provider: provider.id,
      kind: captured.image ? 'image' : 'output',
      capturedAt,
      targetDescription: captured.targetDescription,
      ...(captured.output ? { output: captured.output } : {}),
      ...(captured.pageSignals ? { pageSignals: captured.pageSignals } : {}),
      ...(request.runId ? { runId: request.runId } : {}),
    };
    const filePath = path.join(dir, `${id}-${request.phase}.${captured.image ? 'png' : 'txt'}`);
    fs.writeFileSync(filePath, captured.image ?? formatOutputFile(base), captured.image ? undefined : 'utf8');
    const evidence: EvidenceItem = { ...base, filePath };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(evidence, null, 2), 'utf8');

    return { ok: true, data: { evidence, ...(captured.image ? { imageBase64: captured.image.toString('base64') } : {}) } };
  }
}

export const evidenceCaptureService = new EvidenceCaptureService();
