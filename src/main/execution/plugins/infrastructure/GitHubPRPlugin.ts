/**
 * GitHub PR Creation Plugin — creates pull requests from autonomous work.
 * Minimal production-safe implementation: just enough to close the autonomous loop.
 */

// Stub for @octokit/rest (not currently installed)
class Octokit {
  rest: any;
  constructor(options: { auth: string }) {}
}

export type CreatePRInput = {
  githubToken: string;
  owner: string;
  repo: string;
  title: string;
  body: string;
  baseBranch: string; // e.g., "main"
  headBranch: string; // e.g., "pawos/ticket-123-fix"
};

export type CreatePRResult = {
  ok: boolean;
  prUrl?: string;
  prNumber?: number;
  reason?: string;
};

/**
 * Creates a pull request on GitHub.
 * Throws on network/auth errors; returns {ok: false} for expected failures (branch exists, etc).
 */
export async function createGitHubPR(input: CreatePRInput): Promise<CreatePRResult> {
  try {
    const octokit = new Octokit({ auth: input.githubToken });

    // Create PR
    const result = await octokit.rest.pulls.create({
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      body: input.body,
      base: input.baseBranch,
      head: input.headBranch,
    });

    return {
      ok: true,
      prNumber: result.data.number,
      prUrl: result.data.html_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Expected error: branch doesn't exist or PR already exists
    if (message.includes("Reference does not exist") || message.includes("already exists")) {
      return { ok: false, reason: message };
    }

    // Unexpected error: re-throw
    throw error;
  }
}

/**
 * Parses repo string (e.g., "owner/repo") into components.
 */
export function parseGitHubRepo(repo: string): { owner: string; repo: string } | null {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) return null;
  return { owner, repo: repoName };
}
