/**
 * Jira Write-Back Plugin — adds comments and updates issue status after autonomous work.
 * Minimal: comment on issue, optionally transition status.
 */

export type JiraCommentInput = {
  jiraUrl: string; // e.g., "https://company.atlassian.net"
  apiEmail: string;
  apiToken: string;
  issueKey: string; // e.g., "PROJ-123"
  comment: string;
};

export type JiraStatusTransition = {
  issueKey: string;
  transitionName: string; // e.g., "Done", "In Progress"
};

export type JiraWriteBackResult = {
  ok: boolean;
  commentId?: string;
  reason?: string;
};

/**
 * Posts a comment to a Jira issue.
 */
export async function postJiraComment(input: JiraCommentInput): Promise<JiraWriteBackResult> {
  try {
    const auth = Buffer.from(`${input.apiEmail}:${input.apiToken}`).toString("base64");

    const response = await fetch(`${input.jiraUrl}/rest/api/3/issue/${input.issueKey}/comments`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: input.comment,
                },
              ],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `HTTP ${response.status}: ${text}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { ok: true, commentId: (data.id as string) || "posted" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Transitions a Jira issue to a new status.
 */
export async function transitionJiraIssue(
  jiraUrl: string,
  apiEmail: string,
  apiToken: string,
  issueKey: string,
  transitionName: string
): Promise<JiraWriteBackResult> {
  try {
    const auth = Buffer.from(`${apiEmail}:${apiToken}`).toString("base64");

    // First, get available transitions
    const transitionsResponse = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!transitionsResponse.ok) {
      return {
        ok: false,
        reason: `Failed to fetch transitions: HTTP ${transitionsResponse.status}`,
      };
    }

    const transitionsData = (await transitionsResponse.json()) as {
      transitions?: Array<{ id: string; name: string }>;
    };
    const transition = transitionsData.transitions?.find((t) => t.name === transitionName);

    if (!transition) {
      return {
        ok: false,
        reason: `Transition "${transitionName}" not found for issue ${issueKey}`,
      };
    }

    // Execute transition
    const response = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transition: { id: transition.id },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `HTTP ${response.status}: ${text}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
