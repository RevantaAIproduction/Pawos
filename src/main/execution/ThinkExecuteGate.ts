import type { ActionRequest } from '../../shared/actions/ActionTypes';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import type { CodingMode } from './CodingModeStore';
import type { InfraMode } from '../infrastructure/InfraModeStore';

/**
 * Pure predicates behind DesktopExecutionEngine.execute()'s Think-vs-Execute wall — extracted so
 * the real, billing-backed gating logic is unit-testable without importing the full engine (which
 * pulls in every registered plugin). `canExecute` is the tier's 'advancedRuntimes' entitlement;
 * `codingMode`/`infraMode` are CodingModeStore/InfraModeStore's local, billing-independent safety
 * toggles, which can only matter once the tier itself allows execution — a tier without
 * 'advancedRuntimes' is always blocked here regardless of what the local preference file says.
 * (Since 406663d Paw Go's tier includes 'advancedRuntimes', so on Go the local toggle decides.)
 */

/**
 * Execution needs a signed-in account: `verifiedUserId` is the main process's own AccountSession
 * (a Supabase-verified token), never anything the renderer sends with the request.
 */
export function accountExecutionBlocked(actionType: ActionRequest['type'], verifiedUserId: string | null): boolean {
  return !verifiedUserId && (CODING_EXECUTION_ACTION_TYPES.includes(actionType) || INFRA_EXECUTION_ACTION_TYPES.includes(actionType));
}

export function codingExecutionBlocked(actionType: ActionRequest['type'], canExecute: boolean, codingMode: CodingMode): boolean {
  return CODING_EXECUTION_ACTION_TYPES.includes(actionType) && (!canExecute || codingMode === 'go');
}

export function infraExecutionBlocked(actionType: ActionRequest['type'], canExecute: boolean, infraMode: InfraMode): boolean {
  return INFRA_EXECUTION_ACTION_TYPES.includes(actionType) && (!canExecute || infraMode === 'investigate');
}
