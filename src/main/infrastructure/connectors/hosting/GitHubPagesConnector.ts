import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const GITHUB_API = 'https://api.github.com';
const GIT_TIMEOUT_MS = 5 * 60 * 1000;

function runGit(args: string[], cwd: string, token: string): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      // Never let the real token leak into a surfaced error message, even though it only ever
      // appears in an in-memory remote URL argument, never written to disk or process listing.
      const redact = (s: string) => s.split(token).join('***');
      if (error) {
        resolve({ ok: false, message: redact((stderr || error.message).trim().slice(-1500)) });
        return;
      }
      resolve({ ok: true, stdout: redact(stdout.trim()) });
    });
  });
}

/**
 * Real GitHub Pages connector. Deploys by pushing the given (already-built)
 * static output directory as a fresh commit on the `gh-pages` branch of a
 * real GitHub repo, using the standard GitHub-Actions-style token-in-URL
 * technique (`https://x-access-token:{token}@github.com/{repo}.git`) rather
 * than requiring the user's own git credential helper — the same "shell to
 * real git" discipline as runGit.ts, extended with an authenticated remote
 * instead of the user's already-configured origin. Status reads go through
 * GitHub's real REST API using the same GITHUB_TOKEN already used by
 * GitHubSourceControlConnector/GitHubActionsConnector.
 *
 * GitHub Pages has no staging/production distinction to promote between,
 * so promote() honestly reports that rather than fabricating one.
 */
export class GitHubPagesConnector implements HostingConnector {
  readonly id = 'githubPages' as const;
  readonly displayName = 'GitHub Pages';

  constructor(
    private token: string | undefined,
    private repo: string | undefined, // "owner/repo"
    private branch: string = 'gh-pages'
  ) {}

  isConfigured(): boolean {
    return Boolean(this.token && this.repo);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'GitHub Pages is not configured. Set GITHUB_TOKEN and GITHUB_PAGES_REPO ("owner/repo") to connect it.' };
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private pagesUrl(): string {
    const [owner, name] = (this.repo as string).split('/');
    return `https://${owner}.github.io/${name}`;
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!fs.existsSync(projectPath)) {
      return { ok: false, reason: `Local path "${projectPath}" does not exist — nothing to publish.` };
    }

    const token = this.token as string;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ghpages-'));

    try {
      await fs.promises.cp(projectPath, tmpDir, {
        recursive: true,
        force: true,
        filter: (src) => path.basename(src) !== '.git',
      });

      const authenticatedRemote = `https://x-access-token:${token}@github.com/${this.repo}.git`;

      let step = await runGit(['init', '-q'], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `git init failed: ${step.message}` };

      step = await runGit(['checkout', '-q', '-b', this.branch], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `git checkout failed: ${step.message}` };

      step = await runGit(['add', '-A'], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `git add failed: ${step.message}` };

      step = await runGit(
        ['-c', 'user.email=paw@pawos.app', '-c', 'user.name=PawOS', 'commit', '-q', '-m', `Deploy ${new Date().toISOString()}`],
        tmpDir,
        token
      );
      if (!step.ok) return { ok: false, reason: `git commit failed (is "${projectPath}" non-empty?): ${step.message}` };

      const sha = await runGit(['rev-parse', 'HEAD'], tmpDir, token);
      if (!sha.ok) return { ok: false, reason: `Could not read the new commit's SHA: ${sha.message}` };

      step = await runGit(['remote', 'add', 'origin', authenticatedRemote], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `git remote add failed: ${step.message}` };

      step = await runGit(['push', '--force', 'origin', `HEAD:refs/heads/${this.branch}`], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `git push to ${this.repo}#${this.branch} failed: ${step.message}` };

      return { ok: true, deploymentUrl: this.pagesUrl(), deploymentId: sha.stdout.trim() };
    } catch (error) {
      return { ok: false, reason: `GitHub Pages deploy failed: ${error instanceof Error ? error.message : String(error)}` };
    } finally {
      fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    }
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GITHUB_API}/repos/${this.repo}/commits?sha=${encodeURIComponent(this.branch)}&per_page=1`, { headers: this.headers() });
      if (!res.ok) {
        if (res.status === 404) return { ok: false, reason: `Branch "${this.branch}" does not exist yet on ${this.repo} — nothing has been deployed.` };
        return { ok: false, reason: `GitHub API returned ${res.status} looking up ${this.repo}#${this.branch}` };
      }
      const data = (await res.json()) as Array<{ sha: string; commit: { author: { date: string } } }>;
      const latest = data[0];
      if (!latest) return { ok: false, reason: `Branch "${this.branch}" on ${this.repo} has no commits.` };

      let status = 'unknown';
      const pagesRes = await fetch(`${GITHUB_API}/repos/${this.repo}/pages`, { headers: this.headers() });
      if (pagesRes.ok) {
        const pages = (await pagesRes.json()) as { status?: string };
        status = pages.status ?? 'unknown';
      }

      return { ok: true, deploymentId: latest.sha, url: this.pagesUrl(), status, createdAt: latest.commit.author.date };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** Rollback resets the gh-pages branch to a previous commit SHA and force-pushes it. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const token = this.token as string;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ghpages-rollback-'));
    const authenticatedRemote = `https://x-access-token:${token}@github.com/${this.repo}.git`;

    try {
      let step = await runGit(['clone', '--quiet', '--branch', this.branch, '--single-branch', authenticatedRemote, tmpDir], os.tmpdir(), token);
      if (!step.ok) return { ok: false, reason: `Could not fetch "${this.branch}" from ${this.repo}: ${step.message}` };

      step = await runGit(['reset', '--hard', deploymentId], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `Commit "${deploymentId}" was not found on "${this.branch}": ${step.message}` };

      step = await runGit(['push', '--force', 'origin', `HEAD:refs/heads/${this.branch}`], tmpDir, token);
      if (!step.ok) return { ok: false, reason: `Rollback push failed: ${step.message}` };

      return { ok: true };
    } finally {
      fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    }
  }

  async promote(): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    return { ok: false, reason: 'GitHub Pages has no separate staging/production slot to promote between — every push to the Pages branch is already live.' };
  }
}
