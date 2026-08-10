import { describe, expect, it } from 'vitest';
import { REPOSITORY_CORRELATION_RULES, repositoryReportBuilder } from './repositoryCorrelate';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import type { RepositoryEvidence } from './repositoryEvidence';
import type { ProjectContext } from '../../../../shared/actions/ProjectTypes';
import type { InfraPullRequest, InfraRepository } from '../../../../shared/infrastructure/InfrastructureTypes';

function baseContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    root: '/tmp/project',
    workspaceName: 'project',
    framework: 'Next.js',
    language: 'typescript',
    packageManager: 'npm',
    buildTool: 'Next.js',
    runtime: null,
    scripts: {},
    git: { isRepo: true },
    docker: true,
    ports: [],
    hasTests: true,
    envFiles: [],
    monorepo: { isMonorepo: false, tool: null },
    lintFormatConfig: { eslint: false, prettier: false },
    designSystem: null,
    ...overrides,
  };
}

function baseEvidence(overrides: Partial<RepositoryEvidence> = {}): RepositoryEvidence {
  return { repoPath: '/tmp/project', context: baseContext(), recentCommitCount: 5, ...overrides };
}

const fakeRepo: InfraRepository = { name: 'repo', fullName: 'owner/repo', defaultBranch: 'main', url: 'u' };

describe('REPOSITORY_CORRELATION_RULES', () => {
  it('produces only the honest "no strong signal" fallback for a fully healthy repository', () => {
    const findings = correlate(baseEvidence(), REPOSITORY_CORRELATION_RULES);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.statement).toMatch(/no strong correlating signal/i);
  });

  it('flags missing tests as an observed, moderate gap', () => {
    const findings = correlate(baseEvidence({ context: baseContext({ hasTests: false }) }), REPOSITORY_CORRELATION_RULES);
    const finding = findings.find((f) => f.statement.includes('No test script'));
    expect(finding).toBeDefined();
    expect(finding?.category).toBe('gap');
    expect(finding?.severity).toBe('moderate');
    expect(finding?.provenance).toBe('observed');
  });

  it('flags a project with no git repository as a major, high-confidence risk', () => {
    const findings = correlate(baseEvidence({ context: baseContext({ git: { isRepo: false } }), recentCommitCount: 0 }), REPOSITORY_CORRELATION_RULES);
    const finding = findings.find((f) => f.statement.includes('No git repository'));
    expect(finding?.severity).toBe('major');
    expect(finding?.confidence).toBe('high');
  });

  it('flags a real git repo with zero commits in the recent window as stale — but never fires notVersionControlled at the same time', () => {
    const findings = correlate(baseEvidence({ recentCommitCount: 0 }), REPOSITORY_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('no commits were found'))).toBe(true);
    expect(findings.some((f) => f.statement.includes('No git repository'))).toBe(false);
  });

  it('tags an undetermined language as inferred, not observed', () => {
    const findings = correlate(baseEvidence({ context: baseContext({ language: 'unknown', framework: null }) }), REPOSITORY_CORRELATION_RULES);
    const finding = findings.find((f) => f.statement.includes("couldn't be determined"));
    expect(finding?.provenance).toBe('inferred');
  });

  it('does not flag a missing framework when the language itself is unknown (avoids a redundant double-gap)', () => {
    const findings = correlate(baseEvidence({ context: baseContext({ language: 'unknown', framework: null }) }), REPOSITORY_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('No recognized application framework'))).toBe(false);
  });

  it('flags remote access gaps with requiresApiAccess provenance, never fabricating remote facts', () => {
    const findings = correlate(
      baseEvidence({ remoteAccessUnavailable: { fullName: 'owner/repo', reason: 'not connected' } }),
      REPOSITORY_CORRELATION_RULES
    );
    const finding = findings.find((f) => f.statement.includes('Remote repository facts'));
    expect(finding?.provenance).toBe('requiresApiAccess');
  });

  it('escalates severity for a large open pull request backlog based on the real observed count', () => {
    const manyPRs: InfraPullRequest[] = Array.from({ length: 25 }, (_, i) => ({
      number: i,
      title: 't',
      author: 'a',
      headBranch: 'h',
      baseBranch: 'b',
      url: 'u',
      state: 'open',
    }));
    const findings = correlate(
      baseEvidence({ remote: { connectorId: 'github', fullName: 'owner/repo', repo: fakeRepo, openPullRequests: manyPRs } }),
      REPOSITORY_CORRELATION_RULES
    );
    const finding = findings.find((f) => f.statement.includes('open pull requests'));
    expect(finding?.severity).toBe('major');
    expect(finding?.confidence).toBe('high');
  });

  it('does not flag a small pull request backlog', () => {
    const fewPRs: InfraPullRequest[] = [{ number: 1, title: 't', author: 'a', headBranch: 'h', baseBranch: 'b', url: 'u', state: 'open' }];
    const findings = correlate(
      baseEvidence({ remote: { connectorId: 'github', fullName: 'owner/repo', repo: fakeRepo, openPullRequests: fewPRs } }),
      REPOSITORY_CORRELATION_RULES
    );
    expect(findings.some((f) => f.statement.includes('open pull requests'))).toBe(false);
  });

  it('flags an inactive remote default branch based on the real commit date', () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const findings = correlate(
      baseEvidence({
        remote: { connectorId: 'github', fullName: 'owner/repo', repo: fakeRepo, latestCommit: { sha: 's', message: 'm', author: 'a', date: oldDate } },
      }),
      REPOSITORY_CORRELATION_RULES
    );
    expect(findings.some((f) => f.statement.includes("hasn't had a commit"))).toBe(true);
  });

  it('does not flag a recently active remote default branch', () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const findings = correlate(
      baseEvidence({
        remote: { connectorId: 'github', fullName: 'owner/repo', repo: fakeRepo, latestCommit: { sha: 's', message: 'm', author: 'a', date: recentDate } },
      }),
      REPOSITORY_CORRELATION_RULES
    );
    expect(findings.some((f) => f.statement.includes("hasn't had a commit"))).toBe(false);
  });
});

describe('repositoryReportBuilder', () => {
  it('assembles domain fields purely from already-gathered evidence', () => {
    const evidence = baseEvidence({
      remote: { connectorId: 'github', fullName: 'owner/repo', repo: fakeRepo, openPullRequests: [] },
    });

    const domain = repositoryReportBuilder.build('/tmp/project', evidence, []);

    expect(domain.repoPath).toBe('/tmp/project');
    expect(domain.workspaceName).toBe('project');
    expect(domain.language).toBe('typescript');
    expect(domain.isGitRepo).toBe(true);
    expect(domain.remote?.fullName).toBe('owner/repo');
    expect(domain.remote?.defaultBranch).toBe('main');
    expect(domain.remote?.openPullRequestCount).toBe(0);
  });

  it('omits the remote field entirely when no remote evidence was gathered', () => {
    const domain = repositoryReportBuilder.build('/tmp/project', baseEvidence(), []);
    expect(domain.remote).toBeUndefined();
  });
});
