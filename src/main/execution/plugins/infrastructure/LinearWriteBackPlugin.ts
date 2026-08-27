/**
 * Linear Write-Back Plugin — adds comments and updates issue status after autonomous work.
 * Uses Linear GraphQL API.
 */

export type LinearCommentInput = {
  linearApiKey: string;
  issueId: string; // Linear issue ID (e.g., "PROJ-123")
  comment: string;
};

export type LinearStatusTransition = {
  issueId: string;
  statusName: string; // e.g., "Done", "In Progress"
};

export type LinearWriteBackResult = {
  ok: boolean;
  commentId?: string;
  reason?: string;
};

/**
 * Posts a comment to a Linear issue via GraphQL.
 */
export async function postLinearComment(input: LinearCommentInput): Promise<LinearWriteBackResult> {
  try {
    const query = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: {issueId: $issueId, body: $body}) {
          success
          comment {
            id
          }
        }
      }
    `;

    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.linearApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          issueId: input.issueId,
          body: input.comment,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `HTTP ${response.status}: ${text}` };
    }

    const data = (await response.json()) as {
      data?: { commentCreate?: { success?: boolean; comment?: { id: string } } };
      errors?: Array<{ message: string }>;
    };

    if (data.errors?.length) {
      return { ok: false, reason: `GraphQL error: ${data.errors[0].message}` };
    }

    if (!data.data?.commentCreate?.success) {
      return { ok: false, reason: "Comment creation failed (unknown reason)" };
    }

    return { ok: true, commentId: data.data.commentCreate.comment?.id || "posted" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Transitions a Linear issue to a new status.
 */
export async function transitionLinearIssue(
  linearApiKey: string,
  issueId: string,
  statusName: string
): Promise<LinearWriteBackResult> {
  try {
    // First, fetch available states for the issue's team
    const fetchQuery = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          team {
            states {
              id
              name
            }
          }
        }
      }
    `;

    const fetchResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${linearApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: fetchQuery, variables: { id: issueId } }),
    });

    if (!fetchResponse.ok) {
      return { ok: false, reason: `Failed to fetch issue states: HTTP ${fetchResponse.status}` };
    }

    const fetchData = (await fetchResponse.json()) as {
      data?: {
        issue?: {
          team?: {
            states?: Array<{ id: string; name: string }>;
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (fetchData.errors?.length) {
      return { ok: false, reason: `GraphQL error: ${fetchData.errors[0].message}` };
    }

    const states = fetchData.data?.issue?.team?.states || [];
    const targetState = states.find((s) => s.name === statusName);

    if (!targetState) {
      return { ok: false, reason: `Status "${statusName}" not found for this team` };
    }

    // Update issue state
    const updateQuery = `
      mutation UpdateIssue($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: {stateId: $stateId}) {
          success
          issue {
            id
          }
        }
      }
    `;

    const updateResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${linearApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: updateQuery,
        variables: { id: issueId, stateId: targetState.id },
      }),
    });

    if (!updateResponse.ok) {
      return { ok: false, reason: `HTTP ${updateResponse.status}` };
    }

    const updateData = (await updateResponse.json()) as {
      data?: { issueUpdate?: { success?: boolean } };
      errors?: Array<{ message: string }>;
    };

    if (updateData.errors?.length) {
      return { ok: false, reason: `GraphQL error: ${updateData.errors[0].message}` };
    }

    if (!updateData.data?.issueUpdate?.success) {
      return { ok: false, reason: "Issue update failed (unknown reason)" };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
