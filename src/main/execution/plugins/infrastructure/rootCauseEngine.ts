import type { EngineeringMemoryEntry } from '../../../../shared/infrastructure/EngineeringMemoryTypes';

export type RootCauseConfidence = 'low' | 'medium' | 'high';
export type RootCauseCandidate = {
  hypothesis: string;
  confidence: RootCauseConfidence;
  reasoning: string;
  evidenceRefs: string[];
};

export type PriorRootCause = { title: string; rootCause: string; resolvedAt?: number };

export type RootCauseInput = {
  healthCheck?: { url: string; ok: boolean; detail: string };
  browserInspection?: { consoleErrors: string[]; networkFailures: string[] };
  /** Newest first — EngineeringMemoryStore.deploymentsForService()'s own order. */
  recentDeployments: EngineeringMemoryEntry[];
  priorRootCauses: PriorRootCause[];
};

/**
 * Root Cause Engine — a small set of deterministic correlation rules over
 * real, already-gathered evidence (never re-fetches anything, never invents
 * a bug it hasn't observed). Every candidate names the exact real fact it's
 * grounded in and its confidence is capped by how directly that fact
 * implicates the symptom — never "certain," since only a human (or a real
 * fix + re-verify) can actually confirm a root cause. If no rule fires, says
 * so honestly instead of forcing a guess.
 */
export function correlateRootCause(input: RootCauseInput): RootCauseCandidate[] {
  const candidates: RootCauseCandidate[] = [];
  const latestDeployment = input.recentDeployments[0];

  if (latestDeployment && latestDeployment.status === 'failure') {
    candidates.push({
      hypothesis: `The most recent deployment failed outright: "${latestDeployment.summary}".`,
      confidence: 'high',
      reasoning: 'The latest recorded deployment entry has status "failure" — a real, on-record fact, not inferred.',
      evidenceRefs: [latestDeployment.id],
    });
  }

  if (input.healthCheck && !input.healthCheck.ok && latestDeployment?.status === 'success') {
    candidates.push({
      hypothesis: 'The service is unreachable/unhealthy despite its most recent deployment reporting success — likely a runtime issue introduced by that deployment.',
      confidence: 'medium',
      reasoning: `Health check to ${input.healthCheck.url} failed (${input.healthCheck.detail}), and the most recent recorded deployment reported success just before this check.`,
      evidenceRefs: [latestDeployment.id],
    });
  } else if (input.healthCheck && !input.healthCheck.ok) {
    candidates.push({
      hypothesis: 'The service is unreachable/unhealthy and there is no successful deployment on record to compare against.',
      confidence: 'low',
      reasoning: `Health check to ${input.healthCheck.url} failed (${input.healthCheck.detail}); with no deployment history to correlate against, this could be a fresh issue, an infrastructure problem, or a service that was never fully deployed.`,
      evidenceRefs: [],
    });
  }

  if (input.browserInspection && (input.browserInspection.consoleErrors.length > 0 || input.browserInspection.networkFailures.length > 0)) {
    const parts = [
      input.browserInspection.consoleErrors.length ? `${input.browserInspection.consoleErrors.length} console error(s)` : null,
      input.browserInspection.networkFailures.length ? `${input.browserInspection.networkFailures.length} failed network request(s)` : null,
    ].filter(Boolean);
    candidates.push({
      hypothesis: `Real ${parts.join(' and ')} observed live in the running application — inspect these specific errors/requests to find the exact break.`,
      confidence: 'medium',
      reasoning: 'Directly observed by opening the live application and reading its real console/network activity — not inferred, not simulated.',
      evidenceRefs: [],
    });
  }

  if (input.priorRootCauses.length > 0) {
    const prior = input.priorRootCauses[0];
    if (prior) {
      candidates.push({
        hypothesis: `This may be the same issue as a previous incident, "${prior.title}" — previously root-caused as: ${prior.rootCause}`,
        confidence: 'low',
        reasoning: 'A previously resolved incident for this same service has a recorded root cause on file. Worth checking whether the same condition recurred — not assumed without checking the current evidence.',
        evidenceRefs: [],
      });
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      hypothesis: 'No strong correlating signal found from deployment history, health checks, or browser inspection.',
      confidence: 'low',
      reasoning: 'None of the automated correlation rules matched real evidence for this investigation — manual review of logs/code is needed to go further.',
      evidenceRefs: [],
    });
  }

  return candidates.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
}

function confidenceRank(c: RootCauseConfidence): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0;
}
