import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { classifyFailure } from '../../shared/execution/RecoveryNarration';

/** Failure classes where a blind "just try the same thing again" can plausibly help — never for a failure that needs a real decision (merge conflicts, missing permissions). */
const RETRYABLE_ON_BLIND_RETRY = new Set(['fileConflict', 'network', 'timeout', 'browserCrash']);

/**
 * Generic recover() body for plugins whose only real remediation is "wait
 * a moment and run the exact same operation again" — file-lock contention
 * (EBUSY/EPERM on Windows), transient network blips, timeouts. Only
 * retries when the failure is actually classified as one of those; every
 * other failure is returned unchanged, identical to BasePlugin's default
 * recover(), so this never pretends to fix something it can't.
 */
export async function recoverByRetry(
  request: ActionRequest,
  result: ActionResult,
  execute: (request: ActionRequest) => Promise<ActionResult>,
  delayMs = 400
): Promise<ActionResult> {
  if (result.ok) return result;
  if (!RETRYABLE_ON_BLIND_RETRY.has(classifyFailure(result.message))) return result;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return execute(request);
}
