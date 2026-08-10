import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { gitRevertCommitPlugin } from './GitRevertCommitPlugin';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-git-revert-test-'));
  git(['init'], dir);
  git(['config', 'user.email', 'test@pawos.local'], dir);
  git(['config', 'user.name', 'PawOS Test'], dir);
  // Deterministic byte-for-byte content regardless of the host's global autocrlf setting.
  git(['config', 'core.autocrlf', 'false'], dir);
  return dir;
}

describe('GitRevertCommitPlugin', () => {
  it('flags a non-git directory', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-not-a-repo-'));
    const reqs = gitRevertCommitPlugin.requirements({ type: 'gitRevertCommit', cwd: other, commitSha: 'HEAD' });
    expect(reqs[0]?.id).toBe('not-a-repo');
  });

  it('flags a missing commit sha', () => {
    const repoDir = makeRepo();
    const reqs = gitRevertCommitPlugin.requirements({ type: 'gitRevertCommit', cwd: repoDir, commitSha: '' });
    expect(reqs[0]?.id).toBe('no-sha');
  });

  it('reverts a real commit, creating a real new commit at HEAD, verified against the actual git log', async () => {
    const repoDir = makeRepo();
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'line1\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'initial commit'], repoDir);
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'line1\nline2\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'second commit'], repoDir);

    const headBefore = git(['rev-parse', 'HEAD'], repoDir).trim();
    const request = { type: 'gitRevertCommit' as const, cwd: repoDir, commitSha: headBefore, confirmed: true };
    const result = await gitRevertCommitPlugin.execute(request);
    expect(result.ok).toBe(true);

    const verified = await gitRevertCommitPlugin.verify(request, result);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      const data = verified.data as { newCommitHash: string };
      expect(data.newCommitHash).not.toBe(headBefore);
      expect(data.newCommitHash).toBe(git(['rev-parse', 'HEAD'], repoDir).trim());
    }
    expect(fs.readFileSync(path.join(repoDir, 'a.txt'), 'utf-8')).toBe('line1\n');
  });

  it('fails honestly (a real git conflict) when a later commit already changed the same lines', async () => {
    const repoDir = makeRepo();
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'a\nb\nc\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'commit 1'], repoDir);

    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'a\nb-changed-by-2\nc\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'commit 2'], repoDir);
    const commit2Sha = git(['rev-parse', 'HEAD'], repoDir).trim();

    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'a\nb-changed-by-3\nc\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'commit 3'], repoDir);

    const result = await gitRevertCommitPlugin.execute({ type: 'gitRevertCommit', cwd: repoDir, commitSha: commit2Sha, confirmed: true });
    expect(result.ok).toBe(false);

    try {
      git(['revert', '--abort'], repoDir);
    } catch {
      // no revert in progress — nothing to abort
    }
  });
});
