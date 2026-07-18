/**
 * What Paw remembers about a project it has opened before — lets a user
 * say "continue my CRM" later without Paw re-searching the disk. Keyed by
 * normalized root path. Running processes and recent errors are
 * deliberately NOT persisted here — they're live/transient (cross-referenced
 * against ProcessManager/ErrorMemoryStore at read time), not stable facts
 * about the workspace itself.
 */
export type WorkspaceRecord = {
  rootPath: string;
  name: string;
  framework: string | null;
  language: string;
  packageManager: string;
  buildTool: string | null;
  ports: number[];
  lastSuccessfulBuild: number | null;
  /** Cached snapshot from the last gitStatus call — set once git plugins exist. */
  gitStatus: unknown | null;
  lastOpened: number;
  /** Capped list of recent commands run in this workspace, most recent last. */
  recentCommands: string[];
  /** Set true by FileWatcher when a file changes outside an analyzeProject call — cleared on the next analyzeProject, so the model knows this snapshot may no longer be accurate. */
  stale: boolean;
  /** Recorded by the Deployment Runtime once this workspace has actually been deployed somewhere — lets the Development Browser visit it without treating it as an arbitrary third-party site. */
  deploymentUrl?: string;
};
