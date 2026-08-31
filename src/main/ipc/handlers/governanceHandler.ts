/**
 * Governance Handler — Approval & Resume Flow
 *
 * Wires approval decisions (Allow/Deny) back to paused execution, enabling
 * the complete approval → resume cycle for destructive actions.
 */

import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';

/** In-memory store of pending approvals waiting for user decision */
const pendingApprovals = new Map<string, { approvalId: string; requestedAt: number; actionType: string; context: Record<string, unknown> }>();

/** Track which approvals have been granted (prevent double-approval) */
const grantedApprovals = new Set<string>();

/**
 * Record a new approval request waiting for user decision
 */
export function recordApprovalRequest(
  approvalId: string,
  actionType: string,
  context: Record<string, unknown> = {}
): void {
  pendingApprovals.set(approvalId, {
    approvalId,
    requestedAt: Date.now(),
    actionType,
    context,
  });
}

/**
 * User approves the pending action — grant permission and mark for resume
 */
export function approveGovernanceRequest(evt: IpcMainInvokeEvent, approvalId: string): { ok: boolean; error?: string } {
  try {
    const approval = pendingApprovals.get(approvalId);
    if (!approval) {
      return { ok: false, error: 'Approval request not found or already processed' };
    }

    // Mark as granted (prevent double-approval)
    grantedApprovals.add(approvalId);
    pendingApprovals.delete(approvalId);

    // Broadcast to all windows so ConversationRuntime can resume
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('governance:approved', { approvalId });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * User denies the pending action — mark as denied
 */
export function denyGovernanceRequest(evt: IpcMainInvokeEvent, approvalId: string): { ok: boolean; error?: string } {
  try {
    const approval = pendingApprovals.get(approvalId);
    if (!approval) {
      return { ok: false, error: 'Approval request not found or already processed' };
    }

    // Mark as denied (don't add to grantedApprovals, just delete)
    pendingApprovals.delete(approvalId);

    // Broadcast to all windows so ConversationRuntime can cancel
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('governance:denied', { approvalId });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Check if an approval has been granted (used during resume to set confirmed=true)
 */
export function hasApprovalBeenGranted(approvalId: string): boolean {
  return grantedApprovals.has(approvalId);
}

/**
 * List all pending approvals waiting for user decision
 */
export function getPendingApprovals(): Array<{ approvalId: string; actionType: string; requestedAt: number }> {
  return Array.from(pendingApprovals.values()).map(({ approvalId, actionType, requestedAt }) => ({
    approvalId,
    actionType,
    requestedAt,
  }));
}

/**
 * Clear expired approvals (older than 1 hour)
 */
export function pruneExpiredApprovals(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, approval] of pendingApprovals.entries()) {
    if (approval.requestedAt < oneHourAgo) {
      pendingApprovals.delete(id);
    }
  }
}
