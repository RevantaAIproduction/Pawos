import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { WorkflowMetadata } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { recordVisitedPage } from '../../memory/entities/webEntities';
import { extractionScript } from './ExtractPageDataPlugin';

function isLocalOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);
  } catch {
    return false;
  }
}

/** Deterministic per-candidate session id — same topic + same candidate index always produces the same id, so a retry (the model re-invoking this with only the failed candidates) never collides with a session a prior run already opened and closed. */
function candidateSessionId(topic: string, index: number): string {
  const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'comparison';
  return `cmp-${slug}-${index}`;
}

/** The real, deterministic step sequence this workflow follows for a given candidate list — reported as-is (never model-narrated) so the Task Card's Execution Plan reflects exactly what the code did. */
function buildPlan(candidates: { name: string; url: string }[]): string[] {
  const steps: string[] = [];
  for (const candidate of candidates) {
    steps.push(`Open ${candidate.name}`);
    steps.push(`Extract data from ${candidate.name}`);
    steps.push(`Close ${candidate.name} tab`);
  }
  return steps;
}

export type ComparisonCandidateOutcome =
  | { name: string; url: string; ok: true; extracted: unknown }
  | { name: string; url: string; ok: false; message: string };

/**
 * The mechanical half of the Comparison Engine, guaranteed in code rather
 * than left to prompt wording: opens one real browser session per
 * candidate (never reused, never sequential-in-the-same-tab), extracts the
 * same structured data extract_page_data would, and closes every temporary
 * tab it opened — regardless of whether that candidate succeeded. One
 * candidate failing (bad URL, page never loads, extraction throws) never
 * aborts the rest — its failure is recorded and the loop continues, so the
 * model can offer a retry scoped to just the failed candidates instead of
 * redoing the whole comparison. This plugin never ranks or recommends —
 * it hands back real per-candidate results for the model to normalize,
 * compare, and reason over itself, then call record_comparison.
 */
export class ComparisonWorkflowPlugin extends BasePlugin {
  id = 'runComparisonWorkflow';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'runComparisonWorkflow';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'runComparisonWorkflow') return [];
    if (!request.candidates || request.candidates.length === 0) {
      return [{ id: 'no-candidates', message: 'I need at least one candidate URL to compare.' }];
    }
    for (const candidate of request.candidates) {
      try {
        new URL(candidate.url);
      } catch {
        return [{ id: 'url-invalid', message: `"${candidate.url}" doesn't look like a valid URL.` }];
      }
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'runComparisonWorkflow') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    // One confirmation covers navigating to the WHOLE candidate batch —
    // matches browseWeb's per-session gate, but decided once here instead
    // of once per candidate, since re-asking per candidate is exactly the
    // inconsistency this workflow exists to remove.
    const needsApproval = request.candidates.some((c) => !isLocalOrigin(c.url));
    if (needsApproval && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    const outcomes: ComparisonCandidateOutcome[] = [];

    for (const [i, candidate] of request.candidates.entries()) {
      const sessionId = candidateSessionId(request.topic, i);
      try {
        if (!isLocalOrigin(candidate.url)) browserRuntime.approveGeneralBrowsing(sessionId);

        const nav = await browserRuntime.navigateUnrestricted(sessionId, candidate.url, request.browser);
        if (!nav.ok) {
          outcomes.push({ name: candidate.name, url: candidate.url, ok: false, message: nav.message });
          continue;
        }

        const currentUrl = browserRuntime.getCurrentUrl(sessionId);
        if (currentUrl) recordVisitedPage(currentUrl, undefined, browserRuntime.browserFor(sessionId));

        const evalResult = await browserRuntime.evaluate(sessionId, extractionScript(request.selectors));
        if (!evalResult.ok) {
          outcomes.push({ name: candidate.name, url: candidate.url, ok: false, message: evalResult.message });
          continue;
        }

        let extracted: unknown;
        try {
          extracted = JSON.parse(evalResult.value as string);
        } catch {
          outcomes.push({ name: candidate.name, url: candidate.url, ok: false, message: 'Could not parse the extracted page data.' });
          continue;
        }

        outcomes.push({ name: candidate.name, url: candidate.url, ok: true, extracted });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error while processing this candidate.';
        outcomes.push({ name: candidate.name, url: candidate.url, ok: false, message });
      } finally {
        // Close this candidate's tab regardless of outcome — "close
        // temporary tabs" applies to failed candidates too, not just
        // successful ones.
        browserRuntime.close(sessionId);
      }
    }

    const succeeded = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - succeeded;
    const workflowMeta: WorkflowMetadata = {
      workflowName: `Comparison: ${request.topic}`,
      plan: buildPlan(request.candidates),
      candidatesProcessed: outcomes.length,
      successfulSteps: succeeded,
      failedSteps: failed,
    };
    const data = { topic: request.topic, outcomes, succeeded, failed, ...workflowMeta };
    if (succeeded === 0) return { ok: false, reason: 'failed', message: 'Every candidate failed.', data };
    return { ok: true, data };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'runComparisonWorkflow') return 'Working on that…';
    return `Comparing ${request.candidates.length} candidates for "${request.topic}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'runComparisonWorkflow') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        const names = request.candidates.map((c) => c.name).join(', ');
        return `I'd like to open and compare ${request.candidates.length} pages for "${request.topic}" (${names}). Should I go ahead?`;
      }
      return describeFailure(result);
    }
    const data = result.data as { succeeded: number; failed: number } | undefined;
    if (data && data.failed > 0) {
      return `I opened and extracted data from ${data.succeeded} of ${data.succeeded + data.failed} candidates for "${request.topic}" — ${data.failed} failed and can be retried.`;
    }
    return `I opened and extracted data from all ${data?.succeeded ?? request.candidates.length} candidates for "${request.topic}".`;
  }
}

export const comparisonWorkflowPlugin = new ComparisonWorkflowPlugin();
