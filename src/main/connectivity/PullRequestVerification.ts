import { infrastructureConnectorRegistry } from '../infrastructure/InfrastructureConnectorRegistry';
import type { SourceControlConnector } from '../../shared/infrastructure/InfrastructureTypes';

/**
 * Real evidence for Autonomous Work completion — closes the gap where `prCreated`/`pr_verified`
 * were previously either unconditionally `true` or hardcoded `false` regardless of whether a PR
 * genuinely existed (see AutonomousTaskBillingGate.ts). Deliberately reuses the already-connected
 * GitHub/GitLab source-control connector's already-real `listPullRequests()` read capability
 * (infrastructureConnectorRegistry, populated by GitHubConnectorSDK/GitLabConnectorSDK.authenticate())
 * — no new connector, no new OAuth scope, no PR-creation capability. This can only ever confirm a
 * PR *exists*; it never creates, edits, or comments on anything.
 */

export interface ParsedPullRequestUrl {
  connectorId: 'github' | 'gitlab';
  repo: string;
  number: number;
}

/** Pure, no I/O — parses a real GitHub/GitLab pull-request URL shape. Returns null for anything
 *  else (a different host, a malformed URL, a non-PR link) — never guesses. */
export function parsePullRequestUrl(prUrl: string): ParsedPullRequestUrl | null {
  let url: URL;
  try {
    url = new URL(prUrl);
  } catch {
    return null;
  }
  if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
    const match = url.pathname.match(/^\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { connectorId: 'github', repo: match[1]!, number: Number(match[2]) };
  }
  if (url.hostname === 'gitlab.com' || url.hostname === 'www.gitlab.com') {
    const match = url.pathname.match(/^\/(.+)\/-\/merge_requests\/(\d+)/);
    if (!match) return null;
    return { connectorId: 'gitlab', repo: match[1]!, number: Number(match[2]) };
  }
  return null;
}

export interface PullRequestVerificationResult {
  verified: boolean;
  reason: string;
}

/**
 * Never throws — every failure mode (unrecognized URL, connector not connected, network failure,
 * no matching PR) is reported as an honest `{ verified: false, reason }`, so a completion attempt
 * always proceeds to the RPC (self-reported provenance), it just never gets to honestly claim
 * `pr_verified: true` unless this genuinely confirmed the PR. `getConnector` is injectable purely
 * for testing — production callers omit it and get the real, already-registered connector.
 */
export async function verifyPullRequestExists(
  prUrl: string,
  getConnector: (connectorId: string) => SourceControlConnector | undefined = (id) => infrastructureConnectorRegistry.get('sourceControl', id)
): Promise<PullRequestVerificationResult> {
  const parsed = parsePullRequestUrl(prUrl);
  if (!parsed) {
    return { verified: false, reason: 'Not a recognized GitHub or GitLab pull/merge request URL — cannot independently verify.' };
  }
  const providerLabel = parsed.connectorId === 'github' ? 'GitHub' : 'GitLab';
  const connector = getConnector(parsed.connectorId);
  if (!connector || !connector.isConfigured()) {
    return { verified: false, reason: `${providerLabel} is not connected — cannot independently verify this pull request.` };
  }
  const result = await connector.listPullRequests(parsed.repo);
  if (!result.ok) {
    return { verified: false, reason: `Could not reach ${providerLabel} to verify: ${result.reason}` };
  }
  const match = result.pullRequests.find((pr) => pr.number === parsed.number && pr.url === prUrl);
  if (!match) {
    return { verified: false, reason: `No pull/merge request #${parsed.number} matching this exact URL was found in ${parsed.repo}.` };
  }
  return { verified: true, reason: `Confirmed via ${providerLabel}: pull request #${parsed.number} exists in ${parsed.repo}.` };
}
