import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import {
  queryCodingEditHistory,
  queryArchitecturalDecisions,
  queryCodingPreferences,
  type CodingEditHistoryAttributes,
  type CodingArchitecturalDecisionAttributes,
  type CodingUserPreferenceAttributes,
} from '../../memory/entities/codingRuntimeMemoryEntities';
import { findLatestValidationReport, type CodingValidationReportAttributes } from '../../memory/entities/codingValidationReportEntities';
import type { ValidationReport } from '../validation/ValidationReportTypes';

export type CodingRuntimeMemorySummary = {
  editHistory: CodingEditHistoryAttributes[];
  architecturalDecisions: CodingArchitecturalDecisionAttributes[];
  preferences: CodingUserPreferenceAttributes[];
  latestValidation: ValidationReport | null;
};

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — read-only. This is the plugin that finally gives
 * the previously-dead `codingMemory` Workspace region a real query behind its static placeholder
 * text (§1's own surfaced gap). Composes across every memory this phase and Phase 8 wrote — edit
 * history, architectural decisions, preferences, and the most recent validation report — never
 * inventing anything for a project that has none of these yet (each field is honestly empty/null,
 * never fabricated).
 */
export class QueryCodingRuntimeMemoryPlugin extends BasePlugin {
  id = 'queryCodingRuntimeMemory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'queryCodingRuntimeMemory';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'queryCodingRuntimeMemory') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'queryCodingRuntimeMemory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const editHistory = queryCodingEditHistory(request.rootPath).map((e) => e.attributes as CodingEditHistoryAttributes);
    const architecturalDecisions = queryArchitecturalDecisions(request.rootPath).map((e) => e.attributes as CodingArchitecturalDecisionAttributes);
    const preferences = queryCodingPreferences(request.rootPath).map((e) => e.attributes as CodingUserPreferenceAttributes);
    const latestValidationEntity = findLatestValidationReport(request.rootPath);
    const latestValidation = latestValidationEntity ? (latestValidationEntity.attributes as CodingValidationReportAttributes).report : null;

    const summary: CodingRuntimeMemorySummary = { editHistory, architecturalDecisions, preferences, latestValidation };
    return { ok: true, data: summary };
  }

  describeInProgress(): string {
    return 'Checking what I remember about this project…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'queryCodingRuntimeMemory') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as CodingRuntimeMemorySummary;
    const total = data.editHistory.length + data.architecturalDecisions.length + data.preferences.length;
    if (total === 0 && !data.latestValidation) return "I don't have any memory of this project yet.";
    return `Found ${data.editHistory.length} edit${data.editHistory.length === 1 ? '' : 's'}, ${data.architecturalDecisions.length} decision${
      data.architecturalDecisions.length === 1 ? '' : 's'
    }, and ${data.preferences.length} preference${data.preferences.length === 1 ? '' : 's'} recorded for this project.`;
  }
}

export const queryCodingRuntimeMemoryPlugin = new QueryCodingRuntimeMemoryPlugin();
