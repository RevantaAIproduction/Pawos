import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { UsageCapability } from '../../shared/billing/UsageEngineTypes';
import { usageEngine, type UsageCheckResult } from '../billing/UsageEngine';
import { classifyActionUsageCapability, shouldEnforceCustomerUsage, type MeteredUsageCapability } from './ActionUsageClassifier';
import { entitlementService } from '../billing/EntitlementService';
import { rollingUsageGate } from '../billing/RollingUsageGate';
import { usageEventStore } from '../billing/UsageEventStore';
import { buildUsageReporter } from '../billing/BuildUsageReporter';
import { scheduleUsageLedgerSync } from '../billing/UsageLedgerSync';
import { creditStore } from '../billing/CreditStore';
import { fileOveragePricePc, fileOveragePriceUsd } from '../../shared/billing/FileOveragePricing';
import { customerPcToPurchaseUsd } from '../../shared/billing/CustomerPcCommercialModel';

export type PooledCodingRuntimeUsageRecorder = (params: {
  organizationId: string;
  capability: MeteredUsageCapability;
  amount: number;
  request: ActionRequest;
}) => Promise<{ ok: true } | { ok: false; message: string }>;

type UsageEngineLike = {
  canConsume(capability: MeteredUsageCapability, amount?: number): UsageCheckResult;
  recordUsage(capability: MeteredUsageCapability, amount?: number): void;
};

type UsageBoundaryDeps = {
  usageEngine?: UsageEngineLike;
  pooledRecorder?: PooledCodingRuntimeUsageRecorder | null;
};

let pooledRecorder: PooledCodingRuntimeUsageRecorder | null = null;

export function setPooledCodingRuntimeUsageRecorder(recorder: PooledCodingRuntimeUsageRecorder | null): void {
  pooledRecorder = recorder;
}

function isAwaitingPluginConfirmation(request: ActionRequest): boolean {
  if ('confirmed' in request && request.confirmed) return false;
  if (request.type === 'applyCodeEdit') return true;
  if (request.type === 'writeFile') return fs.existsSync(request.path);
  return false;
}

function failure(message: string, data?: unknown): ActionResult {
  return { ok: false, reason: 'usage-restricted', message, data };
}

/** An edit to an existing file counts toward the file cap once it changes at least this many lines. */
export const COUNTED_EDIT_MIN_LINES = 30;

export type FileChangeClassification = { path: string; kind: 'create' | 'edit'; lines: number; counted: boolean };

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

/** Lines changed when `before` is replaced by `after`: the span left after trimming the common prefix and suffix. */
export function changedLineCount(before: string, after: string): number {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  return Math.max(endA - start + 1, endB - start + 1, 0);
}

/**
 * Whether a code-file action counts toward the weekly cap — decided BEFORE it runs (afterwards a
 * created file would look like an edit). Creating a file always counts; editing an existing one
 * counts when it changes COUNTED_EDIT_MIN_LINES or more lines. Other actions return null.
 */
export function classifyFileChange(request: ActionRequest): FileChangeClassification | null {
  if (request.type === 'writeFile') {
    let existing: string | null = null;
    try {
      existing = fs.existsSync(request.path) ? fs.readFileSync(request.path, 'utf-8') : null;
    } catch {
      existing = null;
    }
    if (existing === null) {
      return { path: request.path, kind: 'create', lines: splitLines(request.content ?? '').length, counted: true };
    }
    const lines = changedLineCount(existing, request.content ?? '');
    return { path: request.path, kind: 'edit', lines, counted: lines >= COUNTED_EDIT_MIN_LINES };
  }
  if (request.type === 'applyCodeEdit') {
    const lines = (request.edits ?? []).reduce((sum, hunk) => sum + Math.max(hunk.oldLines?.length ?? 0, hunk.newLines?.length ?? 0), 0);
    return { path: request.path, kind: 'edit', lines, counted: lines >= COUNTED_EDIT_MIN_LINES };
  }
  return null;
}

/** Classification made at enforcement time, reused when the successful write is recorded. */
const pendingClassifications = new WeakMap<ActionRequest, FileChangeClassification>();

/** Autonomous work is billed through Ticket Balance, never the weekly caps — but only honour the
 *  marker for accounts that can actually run Autonomous Work, so it can't be used to dodge the cap. */
function isExemptAutonomousWrite(request: ActionRequest): boolean {
  return Boolean(request.autonomousRunId) && entitlementService.isFeatureAvailable('autonomousTaskBilling');
}

/** Over-cap files approved at enforcement time, charged once the write actually succeeds. */
const pendingOverageCharges = new WeakMap<ActionRequest, number>();

/**
 * Refuses a counted code-file change (a new file, or an edit of 30+ lines) once the period's hidden
 * file cap is used up (monthly for Go, weekly otherwise); smaller edits stay allowed. Presented as
 * the Paw Compute limit. Past the cap each counted file is paid from purchased Paw Compute —
 * $1 = 5 files, or 8 small ones (FileOveragePricing) — on every tier, except PawOS Build's final
 * week. A balance that can't cover the next file blocks it (buy more or wait for the reset).
 */
export function enforceFileCap(request: ActionRequest): ActionResult | null {
  const change = classifyFileChange(request);
  if (!change || isExemptAutonomousWrite(request)) return null;
  pendingClassifications.set(request, change);
  const tier = entitlementService.effectiveTier();
  if (rollingUsageGate.canMakeFileChange(tier, change.counted, Date.now(), entitlementService.currentProMaxVariant())) return null;

  const pricePc = fileOveragePricePc(change.lines);
  const priceUsd = fileOveragePriceUsd(change.lines);
  const canBuyPast = entitlementService.canContinueOnPurchasedCompute();
  if (canBuyPast && entitlementService.getStandardBonusCreditsRemaining() >= pricePc) {
    pendingOverageCharges.set(request, pricePc);
    return null;
  }

  const balanceUsd = customerPcToPurchaseUsd(entitlementService.getStandardBonusCreditsRemaining());
  const shortfall =
    canBuyPast && balanceUsd > 0
      ? ` This file needs $${priceUsd.toFixed(3).replace(/0$/, '')} of Paw Compute and you have $${balanceUsd.toFixed(2)} left.`
      : '';
  return failure(rollingUsageGate.fileCapMessage(tier) + shortfall, {
    limit: tier === 'go' ? 'monthly' : 'weekly',
    buildFinalWeek: entitlementService.isBuildFinalWeek(),
    filePriceUsd: priceUsd,
  });
}

/**
 * Records a successful counted code-file change in the active usage ledger (device for Go, account
 * for paid), and charges purchased Paw Compute for an over-cap file — through the same deduction
 * path as other purchased usage (synced to the server, idempotent per file write).
 */
export function recordCodeFileWrite(request: ActionRequest, result: ActionResult): void {
  const change = pendingClassifications.get(request);
  const overagePc = pendingOverageCharges.get(request);
  pendingClassifications.delete(request);
  pendingOverageCharges.delete(request);
  if (!change || !change.counted || !result.ok || isExemptAutonomousWrite(request)) return;
  const writeId = usageEventStore.recordFileWrite(change.path, { kind: change.kind, lines: change.lines });
  if (overagePc !== undefined && overagePc > 0) {
    creditStore.consume(overagePc, `file-overage:${change.kind}`, 'coding', false, true, `file-overage:${writeId}`);
  }
  if (entitlementService.effectiveTier() === 'build') buildUsageReporter.schedule();
  scheduleUsageLedgerSync();
}

export async function enforceCodingRuntimeUsage(request: ActionRequest, deps: UsageBoundaryDeps = {}): Promise<ActionResult | null> {
  if (!shouldEnforceCustomerUsage(request.type)) return null;
  if (isAwaitingPluginConfirmation(request)) return null;

  const fileCapBlocked = enforceFileCap(request);
  if (fileCapBlocked) return fileCapBlocked;

  const capability = classifyActionUsageCapability(request.type);
  if (!capability) return null;

  const engine = deps.usageEngine ?? usageEngine;
  const check = engine.canConsume(capability, 1);
  if (!check.allowed) return failure(check.reason, { capability });

  if (check.pooled) {
    const organizationId = request.scope?.organizationId;
    if (!organizationId) {
      return failure('Enterprise pooled usage must be associated with an organization before Coding Runtime execution can run.', { capability });
    }
    const recorder = deps.pooledRecorder ?? pooledRecorder;
    if (!recorder) {
      return failure('Enterprise pooled Coding Runtime usage enforcement is not connected for this execution path.', { capability });
    }
    const recorded = await recorder({ organizationId, capability, amount: 1, request });
    if (!recorded.ok) return failure(recorded.message, { capability });
    return null;
  }

  engine.recordUsage(capability, 1);
  return null;
}

export function getActionUsageCapability(type: ActionRequest['type']): UsageCapability | null {
  return classifyActionUsageCapability(type);
}
