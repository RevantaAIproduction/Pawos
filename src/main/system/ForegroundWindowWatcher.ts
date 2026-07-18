import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { screen } from 'electron';
import type { ForegroundWindowInfo } from '../../shared/system/ForegroundWindowInfo';

/**
 * Polls which window is actually in the foreground (title, owning process,
 * screen bounds) via a small fixed Win32 script — no npm native dependency
 * needed for something this small. Written to a real .ps1 file once (rather
 * than passed inline via `-Command`, which is fragile with embedded quotes
 * and here-strings across process-argument boundaries) and invoked with
 * `-File` + execFile's args array, never a shell string, so there's no
 * injection surface here — the script content is a fixed constant, never
 * interpolated with external input.
 *
 * Classifies the result so the companion can react: a fullscreen window
 * (a movie, a game, a presentation) means "stay out of the way"; a normal
 * window means "you could sit on top of it while the user works in it."
 * Our own windows are excluded so the companion never reacts to itself.
 */
const POWERSHELL_SCRIPT = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PawOSWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$hwnd = [PawOSWin32]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { Write-Output '{}'; exit }
$rect = New-Object PawOSWin32+RECT
[void][PawOSWin32]::GetWindowRect($hwnd, [ref]$rect)
$procId = 0
[void][PawOSWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
$result = [PSCustomObject]@{
  left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom;
  processName = if ($proc) { $proc.ProcessName } else { "" };
  title = if ($proc) { $proc.MainWindowTitle } else { "" };
}
$result | ConvertTo-Json -Compress
`;

const OWN_PROCESS_NAMES = new Set(['PawOS', 'electron']);

let cached: ForegroundWindowInfo = { kind: 'none' };
let timer: ReturnType<typeof setInterval> | null = null;
let scriptPath: string | null = null;

function ensureScriptFile(): string {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), 'pawos-foreground-window.ps1');
  fs.writeFileSync(scriptPath, POWERSHELL_SCRIPT, 'utf-8');
  return scriptPath;
}

function runPowerShell(): Promise<{ left: number; top: number; right: number; bottom: number; processName: string; title: string } | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', ensureScriptFile()],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const parsed = JSON.parse(stdout.trim() || '{}');
          resolve(parsed.processName !== undefined ? parsed : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function poll(): Promise<void> {
  const raw = await runPowerShell();
  if (!raw || !raw.processName || OWN_PROCESS_NAMES.has(raw.processName)) {
    cached = { kind: 'none' };
    return;
  }

  const width = raw.right - raw.left;
  const height = raw.bottom - raw.top;
  if (width <= 100 || height <= 100) {
    cached = { kind: 'none' };
    return;
  }

  const displayBounds = screen.getPrimaryDisplay().bounds;
  const isFullscreen = width >= displayBounds.width * 0.95 && height >= displayBounds.height * 0.9;

  cached = isFullscreen
    ? { kind: 'fullscreen' }
    : {
        kind: 'app',
        bounds: { x: raw.left, y: raw.top, width, height },
        title: raw.title || '',
        processName: raw.processName,
      };
}

export function startForegroundWindowWatcher(intervalMs = 1500): void {
  if (timer) return;
  void poll();
  timer = setInterval(() => void poll(), intervalMs);
}

export function getForegroundWindowInfo(): ForegroundWindowInfo {
  return cached;
}
