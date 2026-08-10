import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import type { ValidationReport } from '../../execution/validation/ValidationReportTypes';

/**
 * Coding Runtime V2, Validation Pipeline (§12) — persists every validation run as a real Memory
 * Graph entity, per the explicit requirement that validation reports be reusable by the Self-Healing
 * Workflow and survive across sessions rather than existing only as transient console/ActionResult
 * output. Each run is its own one-off event (like `codingEditRequest`/`intelligenceReport`-adjacent
 * facts) — matched by `(projectRoot, runAt)` for lookup, never upserted-in-place, since a later run
 * finding the same or a different result is new evidence, not a correction of the earlier one.
 */
export type CodingValidationReportAttributes = {
  projectRoot: string;
  report: ValidationReport;
};

export function recordValidationReport(report: ValidationReport): Entity {
  const attributes: CodingValidationReportAttributes = { projectRoot: report.projectRoot, report };
  return memoryGraphStore.upsertEntity('codingValidationReport', attributes, { changeType: 'created' });
}

function normalizeRoot(root: string): string {
  return root.trim().toLowerCase();
}

/** The most recent validation report for a project, if one has ever been recorded — real historical evidence for the Self-Healing Workflow/future Coding Runtime Memory to reuse, not re-derived from scratch. */
export function findLatestValidationReport(projectRoot: string): Entity | undefined {
  const target = normalizeRoot(projectRoot);
  const matches = memoryGraphStore.queryEntities({
    type: 'codingValidationReport',
    where: (a) => normalizeRoot((a as CodingValidationReportAttributes).projectRoot) === target,
  });
  return matches.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
