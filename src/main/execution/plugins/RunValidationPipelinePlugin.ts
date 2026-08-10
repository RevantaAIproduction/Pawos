import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { checkSyntax } from '../validation/SyntaxCheck';
import { checkImports } from '../validation/ImportsCheck';
import { runTypecheck } from '../validation/TypecheckRunner';
import { runLint } from '../validation/LintRunner';
import { runBuildCheck } from '../validation/BuildRunner';
import { runTestsCheck } from '../validation/TestRunner';
import { buildValidationReport } from '../validation/ValidationReportBuilder';
import type { ValidationReport } from '../validation/ValidationReportTypes';
import { diagnoseFailure } from '../validation/ValidationFailureDiagnosis';
import { recordValidationReport } from '../../memory/entities/codingValidationReportEntities';
import { repositorySemanticIndexService } from '../semanticIndex/RepositorySemanticIndexService';
import { buildRepositorySemanticIndexPlugin } from './BuildRepositorySemanticIndexPlugin';

/**
 * Coding Runtime V2, Validation Pipeline + Self-Healing Workflow (§12/§13) — the first
 * code-enforced (not prose-only) syntax -> imports -> typeCheck -> lint -> build -> tests sequence,
 * aggregated into one structured, Memory-Graph-persisted ValidationReport. Self-sufficient like
 * every prior Coding Runtime V2 plugin: when `affectedFiles` isn't given, it builds (or reuses) the
 * Repository Semantic Index itself rather than requiring a separate prior tool call. Read-only from
 * the target project's perspective in the sense that it only ever runs the project's *own* declared
 * scripts (or a conservative, clearly-labeled inferred fallback for lint/typecheck only) — never a
 * fabricated command.
 */
export class RunValidationPipelinePlugin extends BasePlugin {
  id = 'runValidationPipeline';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'runValidationPipeline';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'runValidationPipeline') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'runValidationPipeline') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    const root = request.rootPath;

    try {
      const scopeFiles = await this.resolveScopeFiles(root, request.affectedFiles);

      // Cheap, deterministic, in-process checks first.
      const syntax = checkSyntax(scopeFiles);
      const imports = checkImports(root, scopeFiles);

      // Real project-script-driven checks, in the pipeline's own declared order. Always run all
      // four regardless of an earlier one failing, so the final report is honestly complete across
      // every category rather than stopping at the first problem.
      const typeCheck = await runTypecheck(root);
      const lint = await runLint(root);
      const build = await runBuildCheck(root);
      const tests = await runTestsCheck(root);

      const report = buildValidationReport(root, { syntax, imports, typeCheck, lint, build, tests });
      recordValidationReport(report);

      if (report.blockingIssues.length === 0) {
        return { ok: true, data: report };
      }
      return {
        ok: false,
        reason: 'failed',
        message: `Validation failed: ${report.blockingIssues.join(' ')}`,
        data: report,
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Validation pipeline failed to run.' };
    }
  }

  /** `affectedFiles` (already absolute or root-relative paths from an edit batch) scope the cheap
   * checks directly; otherwise self-sufficiently builds/reuses the Repository Semantic Index (same
   * discipline as DiscoverAffectedFilesPlugin) and checks every file it knows about. */
  private async resolveScopeFiles(root: string, affectedFiles: string[] | undefined): Promise<string[]> {
    if (affectedFiles && affectedFiles.length > 0) {
      return affectedFiles.map((f) => (path.isAbsolute(f) ? f : path.join(root, f)));
    }
    let index = repositorySemanticIndexService.getIndex(root);
    if (!index || index.stale) {
      const buildResult = await buildRepositorySemanticIndexPlugin.execute({ type: 'buildRepositorySemanticIndex', rootPath: root });
      if (buildResult.ok) index = repositorySemanticIndexService.getIndex(root);
    }
    return index ? Object.keys(index.files).map((relPath) => path.join(root, relPath)) : [];
  }

  /**
   * The Self-Healing Workflow's diagnosis step (§13): never edits anything itself (only the
   * conversation layer proposes a follow-up `applyCodeEdit` batch from the surfaced
   * `suggestedRecovery`) — so this always returns the same enriched failure rather than a "fixed"
   * result. The engine's bounded MAX_RECOVERY_ATTEMPTS loop naturally caps how many times this runs
   * without needing a new cap of its own; a blind retry of the identical pipeline would just fail
   * identically again (nothing changed), which is exactly why this never re-calls execute().
   */
  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'runValidationPipeline' || result.ok) return result;
    const report = result.data as ValidationReport | undefined;
    if (!report) return result;

    const remediation = report.suggestedRecovery ?? diagnoseFailure(report);
    if (!remediation) return result;

    return {
      ok: false,
      reason: 'failed',
      message: `Validation failed: ${remediation.summary} ${remediation.errorDetail}`.trim(),
      data: { ...report, suggestedRecovery: remediation },
    };
  }

  describeInProgress(): string {
    return 'Running the validation pipeline (syntax, imports, type check, lint, build, tests)…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'runValidationPipeline') return result.ok ? 'Done.' : describeFailure(result);
    const report = result.data as ValidationReport | undefined;
    if (!report) return result.ok ? 'Validation passed.' : describeFailure(result);
    if (result.ok) {
      return report.warnings.length > 0
        ? `Validation passed (${report.warnings.length} step${report.warnings.length === 1 ? '' : 's'} skipped — see the report for why).`
        : 'Validation passed — every check ran clean.';
    }
    const recoveryNote = report.suggestedRecovery ? ` Most likely place to start: ${report.suggestedRecovery.summary}` : '';
    return `Validation failed: ${report.blockingIssues.join(' ')}${recoveryNote}`;
  }
}

export const runValidationPipelinePlugin = new RunValidationPipelinePlugin();
