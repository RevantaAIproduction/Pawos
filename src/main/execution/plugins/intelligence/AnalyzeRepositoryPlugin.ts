import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherRepositoryEvidence } from '../../../intelligence/engines/repositoryIntelligence/repositoryEvidence';
import { REPOSITORY_CORRELATION_RULES, repositoryReportBuilder } from '../../../intelligence/engines/repositoryIntelligence/repositoryCorrelate';
import { findCodingProjectByRoot } from '../../../memory/entities/codingProjectEntities';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

/**
 * Repository Intelligence — the first real consumer of the shared
 * EvidenceCorrelationReportEngine (validates the architecture, not a parallel implementation).
 * Read-only: gathers real repository facts (local filesystem + optional connected remote),
 * deterministically correlates them into scored findings, and persists the report to the same
 * Memory Graph every other domain uses. Never proposes or takes any action itself — a resulting
 * fix still goes through the normal, separately-gated writeFile/gitCommit/etc. actions.
 */
export class AnalyzeRepositoryPlugin extends BasePlugin {
  id = 'analyzeRepository';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeRepository';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeRepository') return [];
    if (!fs.existsSync(request.repoPath)) {
      return [{ id: 'repo-missing', message: `I can't find the folder "${request.repoPath}" — which repository did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeRepository') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.repoPath)) return { ok: false, reason: 'failed', message: `"${request.repoPath}" doesn't exist.` };

    const evidence = await gatherRepositoryEvidence({ repoPath: request.repoPath, remoteFullName: request.remoteFullName });
    const findings = correlate(evidence, REPOSITORY_CORRELATION_RULES);
    const report = assembleReport('repository', request.repoPath, evidence, findings, repositoryReportBuilder);

    // Link to the existing codingProject entity if this root was already analyzed via the Coding
    // Runtime — never fabricates one (that entity needs a real ProjectMapBuilder file-tree pass
    // this plugin doesn't perform).
    const existingProject = findCodingProjectByRoot(evidence.context.root);
    recordIntelligenceReport(report, existingProject?.id);

    return { ok: true, data: report };
  }

  describeInProgress(): string {
    return 'Analyzing the repository…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeRepository') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as IntelligenceReport<RepositoryReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Analyzed "${report.domain.workspaceName}" — ${count} finding${count === 1 ? '' : 's'}, health score ${report.overallScore ?? '—'}.`;
  }
}

export const analyzeRepositoryPlugin = new AnalyzeRepositoryPlugin();
