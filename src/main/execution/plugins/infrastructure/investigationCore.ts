import { analyzeProject } from '../../ProjectAnalyzer';
import { runGit } from '../git/runGit';
import { waitForHttpHealthy } from '../../verification/ProcessVerification';
import { devBrowserManager } from '../../DevBrowserManager';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { findService, findDomain, findResolvedIncidentsWithRootCause } from '../../../memory/entities/infrastructureEntities';
import { correlateRootCause, type RootCauseCandidate } from './rootCauseEngine';
import type { EngineeringMemoryEntry } from '../../../../shared/infrastructure/EngineeringMemoryTypes';
import type { EngineeringReport } from '../../../../shared/infrastructure/EngineeringReportTypes';

export type RecentCommit = { sha: string; message: string; author: string; date: string };
export type BrowserInspection = { consoleErrors: string[]; networkFailures: string[] };
export type InvestigationEvidence = {
  matchedService?: string;
  project?: { framework: string | null; language: string; recentCommit?: RecentCommit };
  healthCheck?: { url: string; ok: boolean; detail: string };
  browserInspection?: BrowserInspection;
  relatedHistory?: EngineeringMemoryEntry[];
  rootCauseCandidates: RootCauseCandidate[];
};

/**
 * The real evidence-gathering core shared by both InvestigateTicketPlugin
 * (ticket-based) and InvestigateProductionIssuePlugin (freeform-description-
 * based, no ticket required) — "Fix production" / "Production is slow" /
 * "Users cannot login" are all requests with no ticket ID to look up, so
 * this factors out everything that doesn't actually depend on there being
 * one: project analysis, live health check, real browser console/network
 * inspection (always closes what it opens, same discipline as
 * ComparisonWorkflowPlugin), prior engineering history, and Root Cause
 * Engine correlation. Mutates `plan`/`findings` in place so callers keep
 * full control over their own opening entries (e.g. "Read ticket" vs.
 * "Understand request").
 */
export async function gatherProductionEvidence(cwd: string | undefined, sessionIdSeed: string, plan: string[], findings: string[]): Promise<InvestigationEvidence> {
  let project: InvestigationEvidence['project'];
  let matchedService: string | undefined;

  if (cwd) {
    plan.push('Discover repository', 'Discover runtime');
    const context = await analyzeProject(cwd);
    plan.push('Check recent commits');
    const log = await runGit(['log', '-1', '--pretty=%H%x1f%s%x1f%an%x1f%ad'], cwd);
    let recentCommit: RecentCommit | undefined;
    if (log.ok) {
      const [sha, message, author, date] = log.stdout.trim().split('\x1f');
      if (sha) {
        recentCommit = { sha, message: message ?? '', author: author ?? '', date: date ?? '' };
        findings.push(`Latest commit: "${message}" by ${author} on ${date}.`);
      }
    }
    project = { framework: context.framework, language: context.language, recentCommit };
    matchedService = context.workspaceName;
    const service = findService(context.workspaceName);
    if (service) findings.push(`Matched to registered service "${context.workspaceName}".`);
  }

  let healthCheck: InvestigationEvidence['healthCheck'];
  let browserInspection: InvestigationEvidence['browserInspection'];
  if (matchedService) {
    const domain = findDomain(matchedService);
    if (domain) {
      plan.push('Discover deployment', 'Investigate production — check live health');
      const hostname = (domain.attributes as { hostname: string }).hostname;
      const url = hostname.startsWith('http') ? hostname : `https://${hostname}`;
      const health = await waitForHttpHealthy(url, { timeoutMs: 10_000 });
      healthCheck = { url, ok: health.ok, detail: health.ok ? `Responded with status ${health.status}.` : health.message };
      findings.push(health.ok ? `Health check passed for ${url}.` : `Health check failed for ${url}: ${health.message}`);

      if (health.ok) {
        plan.push('Open application', 'Inspect browser console', 'Inspect network requests');
        const sessionId = `${sessionIdSeed}`;
        try {
          const opened = await devBrowserManager.open(sessionId, url, [url]);
          if (opened.ok) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            const consoleLog = devBrowserManager.getConsoleLog(sessionId) ?? [];
            const networkErrors = devBrowserManager.getNetworkErrors(sessionId) ?? [];
            const consoleErrors = consoleLog.filter((e) => e.level === 'error').map((e) => e.text);
            const networkFailures = networkErrors.map((e) => `${e.url} (${e.status ?? 'no response'})`);
            browserInspection = { consoleErrors, networkFailures };
            findings.push(
              consoleErrors.length > 0
                ? `Browser console shows ${consoleErrors.length} error(s): ${consoleErrors.slice(0, 3).join('; ')}${consoleErrors.length > 3 ? '…' : ''}`
                : 'Browser console shows no errors.'
            );
            findings.push(
              networkFailures.length > 0
                ? `${networkFailures.length} failed network request(s): ${networkFailures.slice(0, 3).join('; ')}${networkFailures.length > 3 ? '…' : ''}`
                : 'No failed network requests observed.'
            );
          } else {
            findings.push(`Could not open the application to inspect it: ${opened.message}`);
          }
        } finally {
          devBrowserManager.close(sessionId);
        }
      }
    }
  }

  let relatedHistory: InvestigationEvidence['relatedHistory'];
  if (matchedService) {
    const related = engineeringMemoryStore.relatedTo(matchedService);
    if (related.length > 0) {
      relatedHistory = related.slice(0, 5);
      findings.push(`${related.length} prior engineering record(s) found for "${matchedService}" — check relatedHistory before treating this as a first-time issue.`);
    }
  }

  plan.push('Determine root cause');
  const recentDeployments = matchedService ? engineeringMemoryStore.deploymentsForService(matchedService) : [];
  const priorRootCauses = matchedService ? findResolvedIncidentsWithRootCause(matchedService) : [];
  const rootCauseCandidates = correlateRootCause({ healthCheck, browserInspection, recentDeployments, priorRootCauses });
  findings.push(`Root cause candidates: ${rootCauseCandidates.map((c) => `[${c.confidence}] ${c.hypothesis}`).join(' | ')}`);

  return { matchedService, project, healthCheck, browserInspection, relatedHistory, rootCauseCandidates };
}

/**
 * Assembles the Autonomous Engineering Loop's formal Engineering Report from
 * evidence investigationCore.ts already gathered — every field traces back
 * to a real, already-known fact (the top root cause candidate, the actual
 * health check result, the actual matched service), never a fresh guess
 * made at report-assembly time. affectedFiles stays empty here — this
 * investigation core doesn't localize code, only the caller (after
 * reasoning over the report, e.g. via analyze_file_impact) would know that.
 */
export function buildEngineeringReport(issueSummary: string, evidence: InvestigationEvidence, findings: string[]): EngineeringReport {
  const topCandidate = evidence.rootCauseCandidates[0];
  const rootCause = topCandidate
    ? `[${topCandidate.confidence} confidence] ${topCandidate.hypothesis} — ${topCandidate.reasoning}`
    : 'Not yet determined — no correlating evidence was available.';

  const affectedServices = evidence.matchedService ? [evidence.matchedService] : [];

  const riskAssessment =
    evidence.healthCheck?.ok === false
      ? 'High — the service is currently unhealthy/unreachable in production.'
      : evidence.healthCheck?.ok === true
        ? 'Low-to-moderate — the service is currently responding, though real issues may have been found during inspection.'
        : 'Unknown — no live health check was performed (no registered domain on file for this service yet).';

  const deploymentRecommendation =
    topCandidate?.confidence === 'high'
      ? 'A fix is likely needed before the next deploy to this service — do not deploy until the root cause is addressed and validated.'
      : 'Investigate further (or gather more evidence) before deciding on a deployment action.';

  const rollbackPlan =
    affectedServices.length > 0
      ? `If a future deploy introduces a regression here, use rollback_deployment for "${affectedServices[0]}" to restore the previous deployment.`
      : 'No service matched yet to plan a rollback for.';

  return {
    issueSummary,
    rootCause,
    evidence: findings,
    affectedServices,
    affectedFiles: [],
    riskAssessment,
    validation: 'Re-run this investigation after any fix to confirm the health check passes and browser console/network errors are gone.',
    tests: "No automated test run was part of this investigation — run the project's own test suite (via run_command) before deploying any fix.",
    deploymentRecommendation,
    rollbackPlan,
    approvalRequired: true,
  };
}
