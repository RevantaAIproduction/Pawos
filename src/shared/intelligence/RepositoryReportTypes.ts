/**
 * Repository Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Every field here must trace
 * back to something repositoryEvidence.ts actually read (analyzeProject's real filesystem
 * inspection, a real bounded `git log`, or a real ConnectorSDK response) — never a guess.
 */
export type RepositoryReportFields = {
  repoPath: string;
  workspaceName: string;
  language: string;
  framework: string | null;
  buildTool: string | null;
  packageManager: string;
  isGitRepo: boolean;
  hasTests: boolean;
  hasDocker: boolean;
  /** Bounded — "how many commits were found in the most recent window checked," never a full-history claim. */
  recentCommitCount: number;
  remote?: {
    connectorId: string;
    fullName: string;
    defaultBranch: string;
    openPullRequestCount?: number;
  };
};
