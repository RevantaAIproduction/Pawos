import { processManager } from './ProcessManager';
import { checkPortInUse, waitForOsProcess } from './verification/ProcessVerification';
import { detectSoftware } from './plugins/softwareManager';
import type { SoftwareManager } from '../../shared/actions/SoftwareTypes';
import type { CommandShell } from '../../shared/actions/ActionTypes';
import { driveExists, isPathOnNetworkDrive, isUsbDriveMounted, listDrives } from './driveInfo';

export type ResourceKind = 'app' | 'process' | 'port' | 'software' | 'download' | 'docker' | 'command';

type AcquisitionState = {
  ownerExecutionId?: string;
  acquiringSince: number;
  waiters: Array<() => void>;
};

/**
 * Facts-only registry of desktop resources across ALL executions — it never
 * reasons or decides anything, only answers "is this already running /
 * installed / in progress" so a caller (DesktopExecutionEngine's prepare()
 * stage) can choose to reuse an existing resource, wait on one that's mid-
 * acquisition, or proceed fresh. Mostly a thin facade over facts that already
 * exist (ProcessManager, detectSoftware, port/OS-process checks) plus new
 * bookkeeping for in-flight acquisition and ownership, neither of which
 * existed anywhere before this.
 */
class ResourceManager {
  private acquiring = new Map<string, AcquisitionState>();

  private key(kind: ResourceKind, id: string): string {
    return `${kind}:${id}`;
  }

  /** A process Paw itself started via ProcessManager, still running. */
  isProcessRunning(processId: string): boolean {
    return processManager.getInfo(processId)?.status === 'running';
  }

  /** An application (possibly launched outside ProcessManager) with a known OS process image name — a fast single-shot tasklist check, not a wait. */
  async isAppRunning(imageName: string): Promise<boolean> {
    return waitForOsProcess(imageName, { timeoutMs: 300 });
  }

  async isPortInUse(port: number): Promise<boolean> {
    return checkPortInUse(port);
  }

  async isInstalled(manager: SoftwareManager, packageId: string): Promise<boolean> {
    const result = await detectSoftware(manager, packageId);
    return result.installed;
  }

  /** Any managed process whose command+cwd match — used to avoid starting a duplicate long-running process for the same thing. */
  findRunningProcessByCommand(command: string, cwd: string, shell?: CommandShell) {
    return processManager.list().find((p) => p.command === command && p.cwd === cwd && p.shell === shell && p.status === 'running');
  }

  isInProgress(kind: ResourceKind, id: string): boolean {
    return this.acquiring.has(this.key(kind, id));
  }

  /**
   * Marks a resource as being acquired (a download/install/long-running
   * start in flight) so a concurrent request for the exact same resource
   * waits instead of duplicating it. Resolves immediately with
   * `{acquired: true}` for the first caller; any caller while it's still
   * in progress waits until `release()` is called, then resolves with
   * `{acquired: false, waited: true}` — the caller decides what "waited"
   * means for it (usually: re-check the fact, e.g. isInstalled, rather than
   * doing the acquisition work itself).
   */
  async acquire(kind: ResourceKind, id: string, ownerExecutionId?: string): Promise<{ acquired: true } | { acquired: false; waited: true }> {
    const key = this.key(kind, id);
    const existing = this.acquiring.get(key);
    if (existing) {
      await new Promise<void>((resolve) => existing.waiters.push(resolve));
      return { acquired: false, waited: true };
    }
    this.acquiring.set(key, { ownerExecutionId, acquiringSince: Date.now(), waiters: [] });
    return { acquired: true };
  }

  release(kind: ResourceKind, id: string): void {
    const key = this.key(kind, id);
    const state = this.acquiring.get(key);
    if (!state) return;
    this.acquiring.delete(key);
    state.waiters.forEach((resolve) => resolve());
  }

  ownerOf(kind: ResourceKind, id: string): string | undefined {
    return this.acquiring.get(this.key(kind, id))?.ownerExecutionId;
  }

  // File Runtime facts — same additive pattern as everything above, just
  // a thin facade over driveInfo.ts instead of ProcessManager/softwareManager.
  driveExists = driveExists;
  isPathOnNetworkDrive = isPathOnNetworkDrive;
  isUsbDriveMounted = isUsbDriveMounted;
  listDrives = listDrives;
}

export const resourceManager = new ResourceManager();
