import type { ActionRequest } from './ActionTypes';

/**
 * The composer's "mode" picker (Manual / Accept edits / Plan / Auto / Bypass permissions) —
 * matches Claude Code's own mode UI, but every mode here maps onto PawOS's EXISTING confirmation
 * mechanism (DESTRUCTIVE_ACTION_TYPES gate in DesktopExecutionEngine.execute() + the self-gated
 * writeFile/applyCodeEdit plugins, both surfaced identically as `reason: 'requires-confirmation'`
 * — see ConversationRuntime.ts's handleToolCall). This is deliberately NOT a second permission
 * system: the backend gate is never touched, never weakened, and never bypassed by renderer state
 * alone. What changes per mode is only WHO supplies the "yes" — a human reply, or (for
 * 'acceptEdits'/'bypass') an automatic call into the exact same executeConfirmedAction() path a
 * real human "yes" already uses.
 */
export type ConversationExecutionMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' | 'bypass';

export type ExecutionModeDescriptor = {
  id: ConversationExecutionMode;
  label: string;
  description: string;
};

/** Matches today's actual default behavior (every destructive action waits for a human "yes") — selecting this mode changes nothing. */
export const DEFAULT_EXECUTION_MODE: ConversationExecutionMode = 'auto';

export const EXECUTION_MODE_CATALOG: ExecutionModeDescriptor[] = [
  { id: 'manual', label: 'Manual', description: 'Always ask before making changes' },
  { id: 'acceptEdits', label: 'Accept edits', description: 'Automatically approve file and code edits' },
  { id: 'plan', label: 'Plan', description: 'Create a plan before making changes' },
  { id: 'auto', label: 'Auto', description: 'Paw handles permission decisions' },
  { id: 'bypass', label: 'Bypass permissions', description: 'Skip confirmation for every action' },
];

/**
 * The two action types WriteFilePlugin/ApplyCodeEditPlugin self-gate as edits (both return
 * `reason: 'requires-confirmation'` from inside the plugin itself, never via the blanket
 * DESTRUCTIVE_ACTION_TYPES engine gate) — the only types 'acceptEdits' mode ever auto-confirms.
 * Commands, deploys, git writes, and every other destructive type keep requiring a real human
 * "yes" even in this mode.
 */
export const EDIT_ACTION_TYPES: ActionRequest['type'][] = ['writeFile', 'applyCodeEdit'];

/**
 * Pure decision, called only for a request that has ALREADY been refused with
 * `reason: 'requires-confirmation'` by the real backend gate (DesktopExecutionEngine.execute()'s
 * DESTRUCTIVE_ACTION_TYPES check, or a plugin's own self-gate) — this function never decides
 * whether confirmation is required, only whether the human's "yes" is supplied automatically
 * (because the user explicitly chose a mode that says so) or awaited for real. 'bypass' only ever
 * returns true when the user has separately, explicitly enabled it in Settings (default off) —
 * this function itself never flips that setting.
 */
export function shouldAutoConfirmAction(
  mode: ConversationExecutionMode,
  requestType: ActionRequest['type'],
  bypassPermissionsEnabled: boolean
): boolean {
  if (mode === 'bypass') return bypassPermissionsEnabled;
  if (mode === 'acceptEdits') return EDIT_ACTION_TYPES.includes(requestType);
  return false;
}

/**
 * Additive system-prompt instruction for Plan mode — steers the model to propose a reviewable
 * plan (the existing propose_execution_plan / propose_code_edit_plan tools) before starting
 * multi-step work, without touching the backend confirmation gate at all: every action this plan
 * eventually leads to still goes through the exact same DESTRUCTIVE_ACTION_TYPES/self-gate check
 * as any other mode.
 */
export function buildPlanModeInstruction(): string {
  return [
    'Plan mode is active. Before starting any multi-step task that will create, edit, run, or',
    'deploy anything, first call propose_execution_plan (or propose_code_edit_plan for code',
    'changes) so the user can review the plan. Only continue with the actual steps after the user',
    'has reviewed it. Simple, single-step requests and plain questions do not need a plan.',
  ].join(' ');
}
