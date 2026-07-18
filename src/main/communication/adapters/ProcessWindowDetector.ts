import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Real, generic "is this process running, and what are its window titles"
 * check — same safe pattern as ForegroundWindowWatcher.ts (a fixed .ps1
 * script written once to a temp file, invoked via execFile's args array,
 * never a shell string, so process names supplied here can never inject).
 * This is the mechanism behind MeetingProviderAdapter's `detect()` for
 * every desktop-app-based provider (Zoom, Teams, Webex): real process
 * presence, not a guess.
 */
const POWERSHELL_SCRIPT = `param([string]$ProcessName)
$procs = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" }
$result = @($procs | ForEach-Object { [PSCustomObject]@{ processId = $_.Id; title = $_.MainWindowTitle } })
$result | ConvertTo-Json -Compress
`;

let scriptPath: string | null = null;

function ensureScriptFile(): string {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), 'pawos-process-window-detector.ps1');
  fs.writeFileSync(scriptPath, POWERSHELL_SCRIPT, 'utf-8');
  return scriptPath;
}

export type DetectedWindow = { processId: number; title: string };

/** Real process + window-title lookup for one executable name (no extension, e.g. "Zoom", "Teams", "Webex"). Returns [] on any failure — a detection tool must never throw and break the caller's own status reporting. */
export function findWindowsForProcess(processName: string): Promise<DetectedWindow[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', ensureScriptFile(), '-ProcessName', processName],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const trimmed = stdout.trim();
          if (!trimmed) return resolve([]);
          const parsed = JSON.parse(trimmed);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          resolve(list.filter((w) => w && typeof w.title === 'string'));
        } catch {
          resolve([]);
        }
      }
    );
  });
}
