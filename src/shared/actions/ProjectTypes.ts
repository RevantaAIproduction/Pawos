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
  /** Coding Runtime V2, Context Understanding Engine (§5) — additive fields, same "pure filesystem inspection, never guessed" discipline as everything above. */
  monorepo: { isMonorepo: boolean; tool: 'pnpm' | 'lerna' | 'nx' | 'npm-workspaces' | null };
  /** Existence checks only — never runs eslint/prettier itself (that's the Validation Pipeline's job, a later phase). */
  lintFormatConfig: { eslint: boolean; prettier: boolean };
  /** First recognized UI/design-system dependency or config file found — null means none of the known signals were present, not "definitely has no design system." */
  designSystem: string | null;
};
