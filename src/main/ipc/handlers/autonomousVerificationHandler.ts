/**
 * Autonomous Run Verification Handler — approves or rejects human verification of autonomous work.
 * Called from renderer process which has Supabase auth context.
 */

export type VerifyAutonomousRunInput = {
  runId: string;
  approved: boolean;
  verifierNotes?: string;
};

export type VerifyAutonomousRunResult = {
  ok: boolean;
  reason?: string;
  billingEventId?: string;
};

/**
 * Stub handler — the actual verification logic is implemented in the renderer
 * via AutonomousVerificationPanel.tsx which has direct Supabase access.
 * This handler exists as a contract point; verification flows directly from
 * renderer to Supabase RPCs (transition_autonomous_task_run, mark_autonomous_task_completed).
 */
export async function verifyAutonomousRun(input: VerifyAutonomousRunInput): Promise<VerifyAutonomousRunResult> {
  // This is a stub — verification is handled in the renderer with actual Supabase access.
  // Main process cannot directly call Supabase (no auth context here).
  return {
    ok: false,
    reason: 'Verification must be called from renderer process with Supabase auth context',
  };
}
