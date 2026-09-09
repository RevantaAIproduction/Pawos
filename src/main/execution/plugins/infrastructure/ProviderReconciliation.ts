/**
 * Unknown-result reconciliation: recover external comment IDs by querying provider APIs
 * when response is lost (network timeout, crash, etc.) but provider may have accepted request.
 */

interface ReconciliationResult {
  found: boolean;
  commentId?: string;
  error?: string;
}

/**
 * Jira reconciliation: query comments by issue and find by body text + timestamp window
 */
export async function reconcileJiraComment(
  jiraUrl: string,
  apiEmail: string,
  apiToken: string,
  issueKey: string,
  expectedBody: string,
  timeoutWindowSeconds: number = 120
): Promise<ReconciliationResult> {
  try {
    // Query issue comments, ordered by newest first
    const response = await fetch(
      `${jiraUrl}/rest/api/3/issue/${issueKey}/comments?orderBy=-created&maxResults=50`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiEmail}:${apiToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return {
        found: false,
        error: `Jira API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as any;
    const comments = data.comments || [];

    // Look for comment matching expected body + recent creation time
    const now = Date.now();
    const windowMs = timeoutWindowSeconds * 1000;

    const candidates: Array<{ id: string; createdTime: number }> = [];

    for (const comment of comments) {
      const createdTime = new Date(comment.created).getTime();
      const age = now - createdTime;

      // Match: body text and creation time within window
      if (comment.body && comment.body.includes(expectedBody) && age < windowMs) {
        candidates.push({ id: comment.id, createdTime });
      }
    }

    // Safety: fail if multiple candidates (ambiguous reconciliation)
    if (candidates.length > 1) {
      return {
        found: false,
        error: `Ambiguous reconciliation: ${candidates.length} comments match (cannot determine which is original)`,
      };
    }

    if (candidates.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const candidate = candidates[0]!;
      return {
        found: true,
        commentId: candidate.id,
      };
    }

    return {
      found: false,
      error: 'No matching comment found',
    };
  } catch (err) {
    return {
      found: false,
      error: `Jira reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Linear reconciliation: query issue comments via GraphQL
 */
export async function reconcileLinearComment(
  linearApiKey: string,
  issueId: string,
  expectedBody: string,
  timeoutWindowSeconds: number = 120
): Promise<ReconciliationResult> {
  try {
    const query = `
      query {
        issue(id: "${issueId}") {
          id
          comments(first: 50) {
            edges {
              node {
                id
                body
                createdAt
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${linearApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return {
        found: false,
        error: `Linear API returned ${response.status}`,
      };
    }

    const data = (await response.json()) as any;

    if (data.errors) {
      return {
        found: false,
        error: `Linear GraphQL error: ${data.errors[0]?.message || 'unknown'}`,
      };
    }

    const comments = data.data?.issue?.comments?.edges || [];
    const now = Date.now();
    const windowMs = timeoutWindowSeconds * 1000;

    const candidates: Array<{ id: string; createdTime: number }> = [];

    // Look for comment matching expected body + recent creation time
    for (const edge of comments) {
      const comment = edge.node;
      const createdTime = new Date(comment.createdAt).getTime();
      const age = now - createdTime;

      // Match: body text and creation time within window
      if (comment.body && comment.body.includes(expectedBody) && age < windowMs) {
        candidates.push({ id: comment.id, createdTime });
      }
    }

    // Safety: fail if multiple candidates (ambiguous reconciliation)
    if (candidates.length > 1) {
      return {
        found: false,
        error: `Ambiguous reconciliation: ${candidates.length} comments match (cannot determine which is original)`,
      };
    }

    if (candidates.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const candidate = candidates[0]!;
      return {
        found: true,
        commentId: candidate.id,
      };
    }

    return {
      found: false,
      error: 'No matching comment found',
    };
  } catch (err) {
    return {
      found: false,
      error: `Linear reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * GitHub reconciliation: query PR comments by creation time and body text
 */
export async function reconcileGitHubComment(
  githubToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  expectedBody: string,
  timeoutWindowSeconds: number = 120
): Promise<ReconciliationResult> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?sort=created&direction=desc&per_page=50`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return {
        found: false,
        error: `GitHub API returned ${response.status}`,
      };
    }

    const comments = (await response.json()) as any[];

    const now = Date.now();
    const windowMs = timeoutWindowSeconds * 1000;

    const candidates: Array<{ id: string; createdTime: number }> = [];

    // Look for comment matching expected body + recent creation time
    for (const comment of comments) {
      const createdTime = new Date(comment.created_at).getTime();
      const age = now - createdTime;

      // Match: body text and creation time within window
      if (comment.body && comment.body.includes(expectedBody) && age < windowMs) {
        candidates.push({ id: String(comment.id), createdTime });
      }
    }

    // Safety: fail if multiple candidates (ambiguous reconciliation)
    if (candidates.length > 1) {
      return {
        found: false,
        error: `Ambiguous reconciliation: ${candidates.length} comments match (cannot determine which is original)`,
      };
    }

    if (candidates.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const candidate = candidates[0]!;
      return {
        found: true,
        commentId: candidate.id,
      };
    }

    return {
      found: false,
      error: 'No matching comment found',
    };
  } catch (err) {
    return {
      found: false,
      error: `GitHub reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
