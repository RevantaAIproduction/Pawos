import { infrastructureConnectorRegistry } from '../infrastructure/InfrastructureConnectorRegistry';
import type { SourceControlConnector } from '../../shared/infrastructure/InfrastructureTypes';
import { parsePullRequestUrl } from './PullRequestVerification';

/**
 * The Autonomous Orchestration Layer's "Update external ticket where genuinely supported" step
 * (see AutonomousOrchestrator.ts). Per the real connector-capability audit this codebase performed
 * before writing any of this: Jira/Linear/GitHub Issues have NO write-back capability of any kind
 * (no updateTicket, no addComment, no changeStatus — read-only OAuth scopes across the board), and
 * GitHub/GitLab have no createPullRequest/updatePullRequest capability either. The ONE genuinely
 * real, already-implemented write capability across all four connectors is
 * SourceControlConnector.createPullRequestComment() (GitHub/GitLab only) — this module is the
 * orchestrator's only real "external update," reusing that exact method. It never creates a PR,
 * never updates a ticket, and never fabricates success for a connector that cannot genuinely do
 * this — see postAutonomousCompletionComment()'s own BLOCKED branch for every other case.
 */

export interface PullRequestEvidenceCommentResult {
  posted: boolean;
  reason: string;
  commentUrl?: string;
}

/**
 * Never throws — every failure mode (unrecognized URL, connector not connected, API call failure)
 * is reported as an honest `{ posted: false, reason }`. `getConnector` is injectable purely for
 * testing — production callers omit it and get the real, already-registered connector.
 */
export async function postAutonomousCompletionComment(
  prUrl: string,
  body: string,
  getConnector: (connectorId: string) => SourceControlConnector | undefined = (id) => infrastructureConnectorRegistry.get('sourceControl', id)
): Promise<PullRequestEvidenceCommentResult> {
  const parsed = parsePullRequestUrl(prUrl);
  if (!parsed) {
    return { posted: false, reason: 'Not a recognized GitHub or GitLab pull/merge request URL — cannot post a completion comment.' };
  }
  const providerLabel = parsed.connectorId === 'github' ? 'GitHub' : 'GitLab';
  const connector = getConnector(parsed.connectorId);
  if (!connector || !connector.isConfigured()) {
    return { posted: false, reason: `${providerLabel} is not connected — cannot post a completion comment.` };
  }
  const result = await connector.createPullRequestComment(parsed.repo, parsed.number, body);
  if (!result.ok) {
    return { posted: false, reason: `${providerLabel} comment API call failed: ${result.reason}` };
  }
  return { posted: true, reason: `Posted a completion evidence comment on ${providerLabel} pull request #${parsed.number}.`, commentUrl: result.commentUrl };
}
