import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ProjectContext } from '../../shared/actions/ProjectTypes';
import type { WorkspaceRecord } from '../../shared/actions/WorkspaceTypes';

const FILE_NAME = 'workspace-memory.json';
const MAX_RECENT_COMMANDS = 20;

function normalizeRoot(rootPath: string): string {
  return path.resolve(rootPath).toLowerCase();
}

/**
 * Electron's memory of every project Paw has opened — same persistence
 * shape as ConversationSessionStore (a single JSON file under
 * app.getPath('userData'), loaded once, saved on every mutation). Keyed by
 * normalized root path so "continue my CRM" can later resolve without
 * re-scanning the disk.
 */
class WorkspaceMemoryStore {
  private filePath = '';
  private workspaces = new Map<string, WorkspaceRecord>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const records: WorkspaceRecord[] = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
      this.workspaces = new Map(records.map((r) => [normalizeRoot(r.rootPath), r]));
    } catch {
      this.workspaces = new Map();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ workspaces: [...this.workspaces.values()] }, null, 2), 'utf-8');
  }

  list(): WorkspaceRecord[] {
    return [...this.workspaces.values()].sort((a, b) => b.lastOpened - a.lastOpened);
  }

  get(rootPath: string): WorkspaceRecord | undefined {
    return this.workspaces.get(normalizeRoot(rootPath));
  }

  /** Called after analyzeProject inspects a folder — creates or refreshes its entry and marks it as just-opened. */
  upsertFromAnalysis(context: ProjectContext): WorkspaceRecord {
    const key = normalizeRoot(context.root);
    const existing = this.workspaces.get(key);
    const record: WorkspaceRecord = {
      rootPath: context.root,
      name: context.workspaceName,
      framework: context.framework,
      language: context.language,
      packageManager: context.packageManager,
      buildTool: context.buildTool,
      ports: context.ports,
      lastSuccessfulBuild: existing?.lastSuccessfulBuild ?? null,
      gitStatus: existing?.gitStatus ?? null,
      lastOpened: Date.now(),
      recentCommands: existing?.recentCommands ?? [],
      stale: false,
    };
    this.workspaces.set(key, record);
    this.save();
    return record;
  }

  markStale(rootPath: string): void {
    const record = this.workspaces.get(normalizeRoot(rootPath));
    if (!record || record.stale) return;
    record.stale = true;
    this.save();
  }

  recordBuildSuccess(rootPath: string, at: number = Date.now()): void {
    const record = this.workspaces.get(normalizeRoot(rootPath));
    if (!record) return;
    record.lastSuccessfulBuild = at;
    this.save();
  }

  recordCommand(rootPath: string, command: string): void {
    const record = this.workspaces.get(normalizeRoot(rootPath));
    if (!record) return;
    record.recentCommands = [...record.recentCommands, command].slice(-MAX_RECENT_COMMANDS);
    this.save();
  }

  recordGitStatus(rootPath: string, status: unknown): void {
    const record = this.workspaces.get(normalizeRoot(rootPath));
    if (!record) return;
    record.gitStatus = status;
    this.save();
  }

  recordDeploymentUrl(rootPath: string, url: string): void {
    const record = this.workspaces.get(normalizeRoot(rootPath));
    if (!record) return;
    record.deploymentUrl = url;
    this.save();
  }

  /** Every workspace's own recorded deployment URL — the Development Browser's only allowed non-localhost origins. */
  listDeploymentUrls(): string[] {
    return [...this.workspaces.values()].map((r) => r.deploymentUrl).filter((url): url is string => Boolean(url));
  }
}

export const workspaceMemoryStore = new WorkspaceMemoryStore();
