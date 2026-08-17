import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { gitCreateWorktreePlugin } from './GitCreateWorktreePlugin';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-git-worktree-test-'));
  git(['init'], dir);
  git(['config', 'user.email', 'test@pawos.local'], dir);
  git(['config', 'user.name', 'PawOS Test'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\n', 'utf-8');
  git(['add', '.'], dir);
  git(['commit', '-m', 'initial commit'], dir);
  return dir;
}

describe('GitCreateWorktreePlugin', () => {
  it('flags a non-git directory', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-not-a-repo-'));
    const reqs = gitCreateWorktreePlugin.requirements({ type: 'gitCreateWorktree', cwd: other, worktreePath: path.join(other, '..', 'wt'), branchName: 'x' });
    expect(reqs[0]?.id).toBe('not-a-repo');
  });

  it('flags a missing branch name', () => {
    const repoDir = makeRepo();
    const reqs = gitCreateWorktreePlugin.requirements({ type: 'gitCreateWorktree', cwd: repoDir, worktreePath: `${repoDir}-wt`, branchName: '' });
    expect(reqs[0]?.id).toBe('no-branch-name');
  });

  it('flags a worktree path that already exists', () => {
    const repoDir = makeRepo();
    const reqs = gitCreateWorktreePlugin.requirements({ type: 'gitCreateWorktree', cwd: repoDir, worktreePath: repoDir, branchName: 'x' });
    expect(reqs[0]?.id).toBe('worktree-path-exists');
  });

  it('creates a real, isolated worktree on a new branch, verified against the actual filesystem/git state', async () => {
    const repoDir = makeRepo();
    const worktreePath = `${repoDir}-isolated`;
    const request = { type: 'gitCreateWorktree' as const, cwd: repoDir, worktreePath, branchName: 'pawos-autonomous/test-run' };

    const result = await gitCreateWorktreePlugin.execute(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { worktreePath: string; branchName: string; baseCommit: string };
      expect(data.worktreePath).toBe(worktreePath);
      expect(data.baseCommit).toBe(git(['rev-parse', 'HEAD'], repoDir).trim());
    }

    // Real, independent checkout — the file from the source repo is really there.
    expect(fs.readFileSync(path.join(worktreePath, 'a.txt'), 'utf-8')).toBe('line1\n');
    // Real branch checked out inside the worktree.
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath).trim()).toBe('pawos-autonomous/test-run');

    const verified = await gitCreateWorktreePlugin.verify(request, result);
    expect(verified.ok).toBe(true);

    // The source checkout itself was never touched — still on its original branch, still clean.
    const sourceStatus = git(['status', '--porcelain'], repoDir).trim();
    expect(sourceStatus).toBe('');

    // Modifying the worktree never touches the source checkout — real, structural isolation, not
    // just a claim.
    fs.writeFileSync(path.join(worktreePath, 'a.txt'), 'line1\nline2 from isolated worktree\n', 'utf-8');
    expect(fs.readFileSync(path.join(repoDir, 'a.txt'), 'utf-8')).toBe('line1\n');

    git(['worktree', 'remove', '--force', worktreePath], repoDir);
  });

  it('resolves a non-HEAD baseRef correctly', async () => {
    const repoDir = makeRepo();
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'line1\nline2\n', 'utf-8');
    git(['add', '.'], repoDir);
    git(['commit', '-m', 'second commit'], repoDir);
    const firstCommit = git(['rev-list', '--max-parents=0', 'HEAD'], repoDir).trim();

    const worktreePath = `${repoDir}-from-first-commit`;
    const result = await gitCreateWorktreePlugin.execute({
      type: 'gitCreateWorktree',
      cwd: repoDir,
      worktreePath,
      branchName: 'pawos-autonomous/from-first',
      baseRef: firstCommit,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { baseCommit: string };
      expect(data.baseCommit).toBe(firstCommit);
    }
    // The worktree reflects the FIRST commit's content, not HEAD's.
    expect(fs.readFileSync(path.join(worktreePath, 'a.txt'), 'utf-8')).toBe('line1\n');

    git(['worktree', 'remove', '--force', worktreePath], repoDir);
  });
});
