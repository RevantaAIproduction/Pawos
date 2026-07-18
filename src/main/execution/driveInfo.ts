import { execFile } from 'child_process';
import * as path from 'path';

export type DriveInfo = { letter: string; driveType: 'removable' | 'fixed' | 'network' | 'other'; volumeName?: string };

// Win32_LogicalDisk DriveType: 2=removable (USB), 3=fixed (local disk), 4=network.
const DRIVE_TYPE_MAP: Record<number, DriveInfo['driveType']> = { 2: 'removable', 3: 'fixed', 4: 'network' };

/** Enumerates fixed/removable/network drives via PowerShell CIM — same execFile-shelling convention ProjectAnalyzer.ts already uses for git, not a shell string. */
export function listDrives(): Promise<DriveInfo[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName | ConvertTo-Json -Compress'],
      { timeout: 8000 },
      (error, stdout) => {
        if (error || !stdout.trim()) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            rows.map((r) => ({
              letter: String(r.DeviceID ?? '').replace(':', ''),
              driveType: DRIVE_TYPE_MAP[Number(r.DriveType)] ?? 'other',
              volumeName: r.VolumeName || undefined,
            }))
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

export async function driveExists(letter: string): Promise<boolean> {
  const drives = await listDrives();
  return drives.some((d) => d.letter.toUpperCase() === letter.toUpperCase().replace(':', ''));
}

export async function isPathOnNetworkDrive(targetPath: string): Promise<boolean> {
  const rootLetter = path.parse(targetPath).root.replace(/[\\/:]/g, '');
  if (!rootLetter) return targetPath.startsWith('\\\\'); // UNC path
  const drives = await listDrives();
  return drives.find((d) => d.letter.toUpperCase() === rootLetter.toUpperCase())?.driveType === 'network';
}

export async function isUsbDriveMounted(): Promise<boolean> {
  const drives = await listDrives();
  return drives.some((d) => d.driveType === 'removable');
}
