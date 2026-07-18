/** What Paw actually knows about a project after inspecting it — never guessed, always read from real files on disk. */
export type ProjectContext = {
  root: string;
  workspaceName: string;
  framework: string | null;
  language: 'typescript' | 'javascript' | 'python' | 'java' | 'unknown';
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'unknown';
  buildTool: string | null;
  runtime: string | null;
  scripts: Record<string, string>;
  git: { isRepo: boolean; remoteUrl?: string };
  docker: boolean;
  /** Best-effort hint only (scraped from .env files) — never treated as authoritative. */
  ports: number[];
  hasTests: boolean;
  /** Which well-known env files exist — never their contents (those commonly hold secrets). */
  envFiles: string[];
};
