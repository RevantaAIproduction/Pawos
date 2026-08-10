import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';
import type { RepositoryEvidence } from './repositoryEvidence';

const STALE_REMOTE_DAYS = 90;

/**
 * Repository Intelligence's deterministic rubric — the same discipline as rootCauseEngine.ts's
 * correlateRootCause(): every rule reasons only over evidence gatherRepositoryEvidence() already
 * collected, never re-fetches, never invents a fact it hasn't observed. Each rule is independent
 * and order-agnostic; correlate() (EvidenceCorrelationReportEngine.ts) sorts the combined output.
 */
export const REPOSITORY_CORRELATION_RULES: CorrelationRule<RepositoryEvidence>[] = [
  {
    id: 'missingTests',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.context.hasTests) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'medium',
          statement: 'No test script or test files were found in the project.',
          evidenceRefs: ['context.hasTests'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'notVersionControlled',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.context.git.isRepo) return [];
      return [
        {
          category: 'risk',
          severity: 'major',
          confidence: 'high',
          statement: 'No git repository was detected at this path — the project has no version control.',
          evidenceRefs: ['context.git.isRepo'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'staleRepository',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.context.git.isRepo || evidence.recentCommitCount > 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'medium',
          statement: 'This is a real git repository, but no commits were found in the recent history window checked.',
          evidenceRefs: ['recentCommitCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'unknownLanguage',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.context.language !== 'unknown') return [];
      return [
        {
          category: 'gap',
          severity: 'minor',
          confidence: 'medium',
          statement: "The project's language couldn't be determined from recognizable project files.",
          evidenceRefs: ['context.language'],
          provenance: 'inferred',
        },
      ];
    },
  },
  {
    id: 'noFrameworkDetected',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.context.framework !== null || evidence.context.language === 'unknown') return [];
      return [
        {
          category: 'opportunity',
          severity: 'info',
          confidence: 'low',
          statement: 'No recognized application framework was detected — this may be a library or script project.',
          evidenceRefs: ['context.framework'],
          provenance: 'inferred',
        },
      ];
    },
  },
  {
    id: 'noContainerization',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.context.docker) return [];
      return [
        {
          category: 'opportunity',
          severity: 'info',
          confidence: 'low',
          statement: 'No Dockerfile or docker-compose file was found — containerizing could simplify deployment.',
          evidenceRefs: ['context.docker'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'remoteAccessGap',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.remoteAccessUnavailable) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `Remote repository facts for "${evidence.remoteAccessUnavailable.fullName}" are unavailable: ${evidence.remoteAccessUnavailable.reason}`,
          evidenceRefs: ['remoteAccessUnavailable'],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
  {
    id: 'remotePullRequestBacklog',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.remote?.openPullRequests?.length ?? 0;
      if (count <= 5) return [];
      return [
        {
          category: 'risk',
          severity: count > 20 ? 'major' : 'moderate',
          confidence: 'high',
          statement: `${count} open pull requests were found on the remote repository — review capacity may be lagging behind contribution volume.`,
          evidenceRefs: ['remote.openPullRequests'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'remoteInactive',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const latest = evidence.remote?.latestCommit;
      if (!latest) return [];
      const commitDate = new Date(latest.date);
      if (Number.isNaN(commitDate.getTime())) return [];
      const daysSince = (Date.now() - commitDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < STALE_REMOTE_DAYS) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'medium',
          statement: `The remote repository's default branch hasn't had a commit in over ${Math.floor(daysSince)} days.`,
          evidenceRefs: ['remote.latestCommit'],
          provenance: 'observed',
        },
      ];
    },
  },
];

/**
 * Assembles RepositoryReportFields purely from already-gathered evidence — no fresh guesses at
 * assembly time, same discipline as buildEngineeringReport(). `findings` is accepted (per
 * ReportBuilder's shared signature) but this builder doesn't need to branch on it — the domain
 * fields are facts, not scored conclusions.
 */
export const repositoryReportBuilder: ReportBuilder<RepositoryEvidence, RepositoryReportFields> = {
  build(_subject, evidence, _findings): RepositoryReportFields {
    return {
      repoPath: evidence.repoPath,
      workspaceName: evidence.context.workspaceName,
      language: evidence.context.language,
      framework: evidence.context.framework,
      buildTool: evidence.context.buildTool,
      packageManager: evidence.context.packageManager,
      isGitRepo: evidence.context.git.isRepo,
      hasTests: evidence.context.hasTests,
      hasDocker: evidence.context.docker,
      recentCommitCount: evidence.recentCommitCount,
      remote: evidence.remote
        ? {
            connectorId: evidence.remote.connectorId,
            fullName: evidence.remote.fullName,
            defaultBranch: evidence.remote.repo.defaultBranch,
            openPullRequestCount: evidence.remote.openPullRequests?.length,
          }
        : undefined,
    };
  },
};
