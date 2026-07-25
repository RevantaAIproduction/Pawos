import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import { extractArchive } from '../execution/plugins/archiveUtils';
import { workspaceMemoryStore } from '../execution/WorkspaceMemoryStore';
import type { ProjectSourceDescriptor } from '../../shared/connectivity/ConnectivityTypes';

export interface ProjectSource {
  readonly kind: ProjectSourceDescriptor['kind'];
  /** Clones/extracts/resolves as needed; always returns a real, existing local directory. */
  getLocalPath(): Promise<string>;
  /** Human-readable label for task-card narration. */
  describe(): string;
}

async function isExistingDirectory(candidate: string): Promise<boolean> {
  const stat = await fs.promises.stat(candidate).catch(() => undefined);
  return Boolean(stat?.isDirectory());
}

class LocalFolderSource implements ProjectSource {
  readonly kind = 'localFolder' as const;
  constructor(private readonly folderPath: string) {}

  /** Read-only — never creates, moves, or modifies anything under this path. */
  async getLocalPath(): Promise<string> {
    const resolved = path.resolve(this.folderPath);
    if (!(await isExistingDirectory(resolved))) {
      throw new Error(`Local folder does not exist: ${resolved}`);
    }
    return resolved;
  }

  describe(): string {
    return `local folder ${this.folderPath}`;
  }
}

class PawWorkspaceSource implements ProjectSource {
  readonly kind = 'pawWorkspace' as const;
  constructor(private readonly workspaceId: string) {}

  /** WorkspaceMemoryStore has no separate id field — it's keyed by
   *  normalized root path, so `workspaceId` here is that same root path. */
  async getLocalPath(): Promise<string> {
    const record = workspaceMemoryStore.get(this.workspaceId);
    if (!record) {
      throw new Error(`No tracked Paw workspace found for: ${this.workspaceId}`);
    }
    if (!(await isExistingDirectory(record.rootPath))) {
      throw new Error(`Tracked workspace root no longer exists on disk: ${record.rootPath}`);
    }
    return record.rootPath;
  }

  describe(): string {
    return `Paw workspace ${this.workspaceId}`;
  }
}

class UploadedZipSource implements ProjectSource {
  readonly kind = 'uploadedZip' as const;
  constructor(private readonly zipPath: string) {}

  /** Extracts into its own uuid-named subdirectory under Electron's temp
   *  path, so concurrent/repeated extractions of different (or the same)
   *  zip never collide with each other. */
  async getLocalPath(): Promise<string> {
    const stat = await fs.promises.stat(this.zipPath).catch(() => undefined);
    if (!stat || !stat.isFile()) {
      throw new Error(`Uploaded zip file does not exist: ${this.zipPath}`);
    }
    const extractDir = path.join(app.getPath('temp'), 'pawos-connectivity-extract', randomUUID());
    try {
      await extractArchive(this.zipPath, extractDir);
    } catch (error) {
      throw new Error(`Failed to extract uploaded zip '${this.zipPath}': ${(error as Error).message}`);
    }
    return extractDir;
  }

  describe(): string {
    return `uploaded zip ${path.basename(this.zipPath)}`;
  }
}

/** Intentional framework stub for githubRepo/gitlabRepo — cloning a remote
 *  repo requires a real, authenticated connector, which is explicitly out
 *  of scope for this framework-only phase. The interface these will
 *  eventually fulfill is locked in today so nothing above this layer needs
 *  to change once Connector #1 (GitHub) / #2 (GitLab) exist. */
class UnavailableProjectSource implements ProjectSource {
  constructor(
    readonly kind: ProjectSourceDescriptor['kind'],
    private readonly message: string
  ) {}

  async getLocalPath(): Promise<string> {
    throw new Error(this.message);
  }

  describe(): string {
    return `${this.kind} (connector not yet registered)`;
  }
}

/**
 * The investigation/engineering pipeline must never care whether a project
 * came from a GitHub repo, a GitLab repo, a local folder, an existing Paw
 * workspace, or an uploaded ZIP — every descriptor resolves to a
 * `ProjectSource` whose `getLocalPath()` always returns a real, existing
 * local directory (or throws a clear error), regardless of origin.
 *
 * Provider-agnostic by construction: this file imports no connector
 * implementation, performs no git operation, no OAuth, and no network call.
 */
class ProjectSourceResolver {
  resolve(descriptor: ProjectSourceDescriptor): ProjectSource {
    switch (descriptor.kind) {
      case 'localFolder':
        return new LocalFolderSource(descriptor.path);
      case 'pawWorkspace':
        return new PawWorkspaceSource(descriptor.workspaceId);
      case 'uploadedZip':
        return new UploadedZipSource(descriptor.zipPath);
      case 'githubRepo':
        return new UnavailableProjectSource(descriptor.kind, `GitHub connector not yet registered — cannot resolve repo '${descriptor.repo}'.`);
      case 'gitlabRepo':
        return new UnavailableProjectSource(descriptor.kind, `GitLab connector not yet registered — cannot resolve repo '${descriptor.repo}'.`);
    }
  }
}

export const projectSourceResolver = new ProjectSourceResolver();
