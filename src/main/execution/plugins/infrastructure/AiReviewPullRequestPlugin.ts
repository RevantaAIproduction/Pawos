import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { generateJson } from '../../../ai/geminiJson';

type AiReviewData = {
  provider: string;
  repo: string;
  prNumber: number;
  summary: string;
  risks: string[];
  suggestions: string[];
  verdict: 'approve' | 'request_changes' | 'comment';
  posted: boolean;
};

const REVIEW_SCHEMA = {
  type: 'object' as const,
  properties: {
    summary: { type: 'string' as const },
    risks: { type: 'array' as const, items: { type: 'string' as const } },
    suggestions: { type: 'array' as const, items: { type: 'string' as const } },
    verdict: { type: 'string' as const, enum: ['approve', 'request_changes', 'comment'] },
  },
  required: ['summary', 'risks', 'suggestions', 'verdict'],
};

/**
 * AI PR review — reads a real PR/MR diff via the source control connector
 * and produces a structured review with Gemini, following the same
 * generateJson + schema shape as fileClassifier.ts (the only other
 * main-process AI call in this codebase). Read-only (fetch diff, generate
 * review) unless postComment is set, in which case posting the comment to
 * GitHub/GitLab needs confirmation first — same conditional-destructiveness
 * self-check WriteFilePlugin uses for overwrites, not a blanket
 * DESTRUCTIVE_ACTION_TYPES entry.
 */
export class AiReviewPullRequestPlugin extends BasePlugin {
  id = 'aiReviewPullRequest';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'aiReviewPullRequest';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'aiReviewPullRequest') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    if (request.postComment && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    const connector = request.provider
      ? infrastructureConnectorRegistry.get('sourceControl', request.provider)
      : infrastructureConnectorRegistry.firstConfigured('sourceControl');
    if (!connector) {
      return { ok: false, reason: 'failed', message: 'No source control connector is configured. Add GITHUB_TOKEN or GITLAB_TOKEN to .env to connect one.' };
    }

    const diffResult = await connector.getPullRequestDiff(request.repo, request.prNumber);
    if (!diffResult.ok) return { ok: false, reason: 'failed', message: diffResult.reason };

    if (!diffResult.diff.trim()) {
      return { ok: false, reason: 'failed', message: `${request.repo}#${request.prNumber} has an empty diff — nothing to review.` };
    }

    const review = await generateJson<{ summary: string; risks: string[]; suggestions: string[]; verdict: 'approve' | 'request_changes' | 'comment' }>({
      prompt: `Review this pull request diff like an experienced engineer doing code review. Be specific and concrete — never invent issues that aren't in the diff. Diff:\n\n${diffResult.diff.slice(0, 40_000)}`,
      schema: REVIEW_SCHEMA,
    });

    if (!review) {
      return { ok: false, reason: 'failed', message: 'The AI review could not be generated (no Gemini API key configured, or the request failed).' };
    }

    let posted = false;
    if (request.postComment) {
      const commentBody = `**AI Review** (${review.verdict.replace('_', ' ')})\n\n${review.summary}\n\n${
        review.risks.length ? `**Risks:**\n${review.risks.map((r) => `- ${r}`).join('\n')}\n\n` : ''
      }${review.suggestions.length ? `**Suggestions:**\n${review.suggestions.map((s) => `- ${s}`).join('\n')}` : ''}`;
      const commentResult = await connector.createPullRequestComment(request.repo, request.prNumber, commentBody);
      if (!commentResult.ok) {
        return { ok: false, reason: 'failed', message: `Generated the review but failed to post it as a comment: ${commentResult.reason}` };
      }
      posted = true;
    }

    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'pullRequestReview',
      repositoryFullName: request.repo,
      summary: `AI review of ${request.repo}#${request.prNumber}: ${review.verdict.replace('_', ' ')}`,
      detail: review.summary,
      status: 'success',
      at: Date.now(),
      refs: { provider: connector.id, prNumber: String(request.prNumber), verdict: review.verdict },
      approvedByUser: Boolean(request.confirmed),
    });

    const data: AiReviewData = {
      provider: connector.id,
      repo: request.repo,
      prNumber: request.prNumber,
      summary: review.summary,
      risks: review.risks,
      suggestions: review.suggestions,
      verdict: review.verdict,
      posted,
    };
    return { ok: true, data };
  }

  describeInProgress(): string {
    return 'Reviewing the pull request…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'aiReviewPullRequest') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `I'll review ${request.repo}#${request.prNumber} and post the review as a comment on the PR. Should I go ahead?`;
      }
      return describeFailure(result);
    }
    const data = result.data as AiReviewData;
    return `Reviewed ${data.repo}#${data.prNumber}: ${data.verdict.replace('_', ' ')}. ${data.summary}${data.posted ? ' Posted as a comment on the PR.' : ''}`;
  }
}

export const aiReviewPullRequestPlugin = new AiReviewPullRequestPlugin();
