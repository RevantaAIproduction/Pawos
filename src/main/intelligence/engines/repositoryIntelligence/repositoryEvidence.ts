import { analyzeProject } from '../../../execution/ProjectAnalyzer';
import type { ProjectContext } from '../../../../shared/actions/ProjectTypes';
import { runGit } from '../../../execution/plugins/git/runGit';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import type { InfraRepository, InfraCommit, InfraPullRequest } from '../../../../shared/infrastructure/InfrastructureTypes';

const RECENT_COMMIT_WINDOW = 50;

/**
 * Real, already-gathered facts about a repository — local filesystem inspection (via the existing
 * analyzeProject/ProjectAnalyzer, unchanged) plus, when a remote full name is given AND a
 * source-control connector (e.g. GitHub) is actually connected, real remote facts via that
 * connector. Never fabricates a remote section when no connector is configured — see
 * `remoteAccessUnavailable`, which is itself real, actionable evidence (a named gap, not silence).
 */
export type RepositoryEvidence = {
  repoPath: string;
  context: ProjectContext;
  /** Count of commits found in the most recent RECENT_COMMIT_WINDOW window — bounded, never a full-history claim. */
  recentCommitCount: number;
  remote?: {
    connectorId: string;
    fullName: string;
    repo: InfraRepository;
    latestCommit?: InfraCommit;
    openPullRequests?: InfraPullRequest[];
  };
  remoteAccessUnavailable?: { fullName: string; reason: string };
};

async function countRecentCommits(repoPath: string): Promise<number> {
  const result = await runGit(['log', '-n', String(RECENT_COMMIT_WINDOW), '--format=%H'], repoPath);
  if (!result.ok) return 0;
  return result.stdout.split('\n').filter(Boolean).length;
}

/**
 * Gathers real evidence for Repository Intelligence — the first concrete consumer of the shared
 * EvidenceCorrelationReportEngine (see AnalyzeRepositoryPlugin.ts). Local analysis always runs;
 * remote analysis is attempted only when `remoteFullName` is given, and degrades honestly to
 * `remoteAccessUnavailable` rather than silently skipping or guessing when no connector is
 * connected or the connector can't see that repo.
 */
export async function gatherRepositoryEvidence(input: { repoPath: string; remoteFullName?: string }): Promise<RepositoryEvidence> {
  const context = await analyzeProject(input.repoPath);
  const recentCommitCount = context.git.isRepo ? await countRecentCommits(input.repoPath) : 0;

  const evidence: RepositoryEvidence = { repoPath: input.repoPath, context, recentCommitCount };
  if (!input.remoteFullName) return evidence;

  const connector = infrastructureConnectorRegistry.firstConfigured('sourceControl');
  if (!connector) {
    evidence.remoteAccessUnavailable = {
      fullName: input.remoteFullName,
      reason: 'No source control connector (e.g. GitHub) is connected — connect one in Settings to include remote repository facts (pull requests, remote commit history) in this report.',
    };
    return evidence;
  }

  const [repoResult, commitResult, prResult] = await Promise.all([
    connector.listRepositories(),
    connector.getLatestCommit(input.remoteFullName),
    connector.listPullRequests(input.remoteFullName),
  ]);

  const repo = repoResult.ok ? repoResult.repos.find((r) => r.fullName === input.remoteFullName) : undefined;
  if (!repo) {
    evidence.remoteAccessUnavailable = {
      fullName: input.remoteFullName,
      reason: repoResult.ok
        ? `The connected ${connector.displayName} account doesn't have access to "${input.remoteFullName}".`
        : repoResult.reason,
    };
    return evidence;
  }

  evidence.remote = {
    connectorId: connector.id,
    fullName: input.remoteFullName,
    repo,
    latestCommit: commitResult.ok ? commitResult : undefined,
    openPullRequests: prResult.ok ? prResult.pullRequests : undefined,
  };
  return evidence;
}
