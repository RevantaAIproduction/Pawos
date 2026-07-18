import type { VisualEvidenceEvent } from '../../shared/communication/CommunicationTypes';
import { getForegroundWindowInfo } from '../system/ForegroundWindowWatcher';

const POLL_INTERVAL_MS = 4000;

/**
 * Real, honest classification of the foreground app/window into a
 * VisualEvidenceEvent kind — based only on the real process name/title the
 * already-running ForegroundWindowWatcher reports, never guessed. This can
 * only ever see what THIS device's own screen shows; it never claims to
 * know whether the other meeting participants are screen-sharing (that's
 * not observable without a provider SDK, so 'screenShareStarted'/
 * 'screenShareStopped' are never emitted here — only real, own-device
 * application-switch evidence).
 */
function classify(processName: string, title: string): { kind: VisualEvidenceEvent['kind']; description: string } {
  const p = processName.toLowerCase();
  const t = title.toLowerCase();
  if (p.includes('powerpnt')) return { kind: 'documentShared', description: `Switched to PowerPoint — ${title}` };
  if (p.includes('winword')) return { kind: 'documentShared', description: `Switched to Word — ${title}` };
  if (p.includes('excel')) return { kind: 'documentShared', description: `Switched to Excel — ${title}` };
  if (p.includes('acrord') || p.includes('sumatrapdf') || t.endsWith('.pdf') || t.includes(' - pdf')) {
    return { kind: 'documentShared', description: `Switched to a PDF — ${title}` };
  }
  if (p.includes('whiteboard') || t.includes('whiteboard')) return { kind: 'whiteboardShared', description: `Switched to a whiteboard — ${title}` };
  if (['chrome', 'msedge', 'brave', 'firefox'].some((b) => p.includes(b))) {
    return { kind: 'browserShared', description: `Switched to the browser — ${title}` };
  }
  return { kind: 'applicationShared', description: `Switched to ${processName || 'another application'} — ${title}` };
}

export type VisualContextHandle = { stop: () => void };

/**
 * Samples the already-running ForegroundWindowWatcher's cache (no new
 * native polling introduced) while a meeting-medium recording is active,
 * and reports real application-switch evidence, timestamped relative to
 * the recording's own start time so it lines up with the transcript. The
 * very first sample is only a baseline — no event fires until something
 * actually changes.
 */
export function startVisualContextTracking(params: {
  recordingStartedAt: number;
  onChange: (event: VisualEvidenceEvent) => void;
}): VisualContextHandle {
  let lastKey: string | null = null;
  const timer: ReturnType<typeof setInterval> = setInterval(() => {
    const info = getForegroundWindowInfo();
    if (info.kind !== 'app') return;
    const key = `${info.processName}|${info.title}`;
    if (key === lastKey) return;
    const isBaseline = lastKey === null;
    lastKey = key;
    if (isBaseline) return;
    const { kind, description } = classify(info.processName, info.title);
    const atSeconds = Math.max(0, Math.floor((Date.now() - params.recordingStartedAt) / 1000));
    params.onChange({ atSeconds, kind, description });
  }, POLL_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}
