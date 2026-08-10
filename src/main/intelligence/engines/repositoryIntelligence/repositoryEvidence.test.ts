import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { gatherRepositoryEvidence } from './repositoryEvidence';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import type { SourceControlConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("hi");\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'initial commit'], { cwd: dir });
}

function fakeSourceControlConnector(overrides: Partial<SourceControlConnector> = {}): SourceControlConnector {
  return {
    id: 'github',
    displayName: 'GitHub',
    isConfigured: () => true,
    listRepositories: vi.fn().mockResolvedValue({ ok: true, repos: [] }),
    getFileContent: vi.fn(),
    getLatestCommit: vi.fn().mockResolvedValue({ ok: false, reason: 'not used' }),
    listPullRequests: vi.fn().mockResolvedValue({ ok: true, pullRequests: [] }),
    getPullRequestDiff: vi.fn(),
    createPullRequestComment: vi.fn(),
    ...overrides,
  } as SourceControlConnector;
}

describe('gatherRepositoryEvidence', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-repo-evidence-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('gathers real local evidence for a plain, non-git folder', async () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'plain-project' }));

    const evidence = await gatherRepositoryEvidence({ repoPath: dir });

    expect(evidence.context.git.isRepo).toBe(false);
    expect(evidence.recentCommitCount).toBe(0);
    expect(evidence.context.workspaceName).toBe('plain-project');
    expect(evidence.remote).toBeUndefined();
    expect(evidence.remoteAccessUnavailable).toBeUndefined();
  });

  it('gathers a real, bounded commit count for a real git repository', async () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'git-project' }));
    initGitRepo(dir);

    const evidence = await gatherRepositoryEvidence({ repoPath: dir });

    expect(evidence.context.git.isRepo).toBe(true);
    expect(evidence.recentCommitCount).toBe(1);
  });

  it('reports remoteAccessUnavailable honestly when no source control connector is configured', async () => {
    vi.spyOn(infrastructureConnectorRegistry, 'firstConfigured').mockReturnValue(undefined);

    const evidence = await gatherRepositoryEvidence({ repoPath: dir, remoteFullName: 'owner/repo' });

    expect(evidence.remote).toBeUndefined();
    expect(evidence.remoteAccessUnavailable?.fullName).toBe('owner/repo');
    expect(evidence.remoteAccessUnavailable?.reason).toMatch(/no source control connector/i);
  });

  it('reports remoteAccessUnavailable honestly when the connected account cannot see the named repo', async () => {
    const connector = fakeSourceControlConnector({
      listRepositories: vi.fn().mockResolvedValue({ ok: true, repos: [{ name: 'other', fullName: 'someone-else/other', defaultBranch: 'main', url: 'u' }] }),
    });
    vi.spyOn(infrastructureConnectorRegistry, 'firstConfigured').mockReturnValue(connector);

    const evidence = await gatherRepositoryEvidence({ repoPath: dir, remoteFullName: 'owner/repo' });

    expect(evidence.remote).toBeUndefined();
    expect(evidence.remoteAccessUnavailable?.reason).toMatch(/doesn't have access/i);
  });

  it('gathers real remote facts when a connector is configured and can see the repo', async () => {
    const now = new Date().toISOString();
    const connector = fakeSourceControlConnector({
      listRepositories: vi.fn().mockResolvedValue({ ok: true, repos: [{ name: 'repo', fullName: 'owner/repo', defaultBranch: 'main', url: 'https://github.com/owner/repo' }] }),
      getLatestCommit: vi.fn().mockResolvedValue({ ok: true, sha: 'abc123', message: 'fix', author: 'a', date: now }),
      listPullRequests: vi.fn().mockResolvedValue({ ok: true, pullRequests: [{ number: 1, title: 't', author: 'a', headBranch: 'h', baseBranch: 'main', url: 'u', state: 'open' }] }),
    });
    vi.spyOn(infrastructureConnectorRegistry, 'firstConfigured').mockReturnValue(connector);

    const evidence = await gatherRepositoryEvidence({ repoPath: dir, remoteFullName: 'owner/repo' });

    expect(evidence.remoteAccessUnavailable).toBeUndefined();
    expect(evidence.remote?.connectorId).toBe('github');
    expect(evidence.remote?.repo.fullName).toBe('owner/repo');
    expect(evidence.remote?.latestCommit?.sha).toBe('abc123');
    expect(evidence.remote?.openPullRequests).toHaveLength(1);
  });
});
