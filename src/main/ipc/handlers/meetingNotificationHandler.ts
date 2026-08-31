/**
 * Pre-meeting notification handler.
 * Sends notifications from main process to renderer when a meeting
 * is starting in ~2 minutes. Renderer shows approve/deny modal.
 */

import { BrowserWindow } from 'electron';
import type { PreMeetingNotification } from '../../workspace/services/CalendarPollingService';

/**
 * Send pre-meeting notification to renderer window
 */
export function sendPreMeetingNotification(
  window: BrowserWindow | null,
  notification: PreMeetingNotification
): boolean {
  try {
    if (!window || window.isDestroyed()) {
      console.warn('[MeetingNotification] No active window to send notification');
      return false;
    }

    window.webContents.send('meeting:preNotification', notification);
    console.log(`[MeetingNotification] Sent: "${notification.title}" starts in ~2 minutes`);
    return true;
  } catch (error) {
    console.error('[MeetingNotification] Failed to send notification:', error);
    return false;
  }
}

/**
 * Handle user approval to join and record meeting
 * Called from renderer when user clicks "Approve" button
 */
export function handlePreMeetingApproval(
  eventId: string,
  meetingLink: string,
  userEmail: string
): { ok: boolean; reason?: string } {
  try {
    // This returns confirmation; actual join/record happens via meeting:joinAndRecord IPC
    console.log(`[MeetingNotification] User approved meeting: ${eventId} (${userEmail})`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to approve meeting',
    };
  }
}

/**
 * Handle user denial of pre-meeting notification
 * Called from renderer when user clicks "Deny" button
 */
export function handlePreMeetingDenial(eventId: string): { ok: boolean } {
  try {
    console.log(`[MeetingNotification] User denied meeting: ${eventId}`);
    return { ok: true };
  } catch (error) {
    console.error('[MeetingNotification] Error handling denial:', error);
    return { ok: false };
  }
}
