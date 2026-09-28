import { execFile } from 'child_process';
import { desktopCapturer } from 'electron';
import type { EvidenceCaptureRequest, EvidenceProviderAvailability } from '../../../shared/evidence/EvidenceTypes';
import { processManager } from '../../execution/ProcessManager';
import { failed, unavailable, type EvidenceProvider, type ProviderCapture } from '../EvidenceProvider';

/** A top-level window owned by the app's process (or one of its child processes). */
export type OwnedWindow = { pid: number; handle: string; title: string };
/** A capturable window as Electron's desktopCapturer reports it (id "window:<handle>:<n>"). */
export type CaptureSource = { id: string; name: string; thumbnail: { isEmpty(): boolean; toPNG(): Buffer } };

/**
 * Windows: every process in the tree rooted at `rootPid` (a launched app usually runs under the shell
 * PawOS started it with, and Electron/Chromium apps spawn children), then each one's main window handle.
 * Tab-separated "pid<TAB>handle<TAB>title" lines.
 */
function listOwnedWindowsWin32(rootPid: number): Promise<OwnedWindow[]> {
  const script = [
    `$root = ${Math.floor(rootPid)}`,
    '$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId',
    '$ids = New-Object System.Collections.Generic.HashSet[int]; [void]$ids.Add($root)',
    'do { $added = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $added = $true } } } while ($added)',
    'Get-Process -Id @($ids) -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { "$($_.Id)`t$([int64]$_.MainWindowHandle)`t$($_.MainWindowTitle)" }',
  ].join('; ');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20_000, windowsHide: true }, (error, stdout) => {
      if (error) return resolve([]);
      resolve(parseOwnedWindows(String(stdout)));
    });
  });
}

export function parseOwnedWindows(output: string): OwnedWindow[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 2 && /^\d+$/.test(parts[0]!.trim()) && /^\d+$/.test(parts[1]!.trim()) && parts[1]!.trim() !== '0')
    .map((parts) => ({ pid: Number(parts[0]), handle: parts[1]!.trim(), title: (parts[2] ?? '').trim() }));
}

/** The capture source for exactly this window handle — matched by id, never by "whatever is active". */
export function matchSource(sources: CaptureSource[], handle: string): CaptureSource | undefined {
  return sources.find((source) => source.id.startsWith(`window:${handle}:`));
}

/**
 * The target app's own window — ONLY that window, never the whole desktop and never "the active window".
 * The window is tied to the ticket's run through the process PawOS launched the app with (startProcess →
 * processId): PawOS walks that process tree, takes those processes' windows, and captures the matching
 * one through Electron's desktopCapturer. Implemented and verified on Windows; macOS/Linux report
 * unavailable until they have an equally exact process→window mapping.
 */
export class DesktopWindowEvidenceProvider implements EvidenceProvider {
  readonly id = 'desktopWindow' as const;

  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly listOwnedWindows: (rootPid: number) => Promise<OwnedWindow[]> = listOwnedWindowsWin32,
    private readonly getSources: () => Promise<CaptureSource[]> = () =>
      desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1920, height: 1200 }, fetchWindowIcons: false }),
    private readonly pidOf: (processId: string) => number | null = (processId) => processManager.getInfo(processId)?.pid ?? null
  ) {}

  async availability(): Promise<EvidenceProviderAvailability> {
    return this.platform === 'win32'
      ? { provider: 'desktopWindow', available: true, verified: true, detail: 'Captures only the window of an app PawOS launched.' }
      : { provider: 'desktopWindow', available: false, verified: false, detail: `Not available on ${this.platform} yet: PawOS only captures an app's own window where it can map the launched process to its window exactly (Windows today).` };
  }

  async capture(request: EvidenceCaptureRequest): Promise<ProviderCapture> {
    if (request.target.provider !== 'desktopWindow') return failed('Not a desktop window target.');
    if (this.platform !== 'win32') return unavailable(`Desktop window capture is not available on ${this.platform} yet.`);
    const pid = this.pidOf(request.target.processId);
    if (!pid) return failed(`No running app with process id "${request.target.processId}" — start the app with PawOS first.`);

    let windows = await this.listOwnedWindows(pid);
    if (windows.length === 0) return unavailable("The app is running but hasn't opened a visible window.");
    const wanted = request.target.windowTitle?.trim().toLowerCase();
    if (wanted) {
      const titled = windows.filter((w) => w.title.toLowerCase().includes(wanted));
      if (titled.length === 0) return unavailable(`None of the app's windows is titled "${request.target.windowTitle}" (found: ${windows.map((w) => w.title || 'untitled').join(', ')}).`);
      windows = titled;
    }
    if (windows.length > 1 && !wanted) {
      return failed(`The app has several windows (${windows.map((w) => w.title || 'untitled').join(', ')}) — give windowTitle to pick one.`);
    }

    const sources = await this.getSources();
    const window = windows[0]!;
    const source = matchSource(sources, window.handle);
    if (!source) return unavailable(`The app's window "${window.title || 'untitled'}" can't be captured (it may be minimized or hidden).`);
    if (source.thumbnail.isEmpty()) return unavailable(`The app's window "${window.title || 'untitled'}" is minimized — nothing to capture.`);
    return { ok: true, targetDescription: `${window.title || 'App window'} (pid ${window.pid})`, image: source.thumbnail.toPNG() };
  }
}
