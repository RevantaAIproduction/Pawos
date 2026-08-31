/**
 * Calendar Polling Service — monitors user's Google Calendar for meetings
 * starting in ~2 minutes and sends pre-meeting notifications.
 *
 * Polls Google Calendar every 30-60 seconds for upcoming meetings.
 * When a meeting starts in ~2 minutes, sends notification to renderer
 * to show approve/deny modal.
 */

import { BrowserWindow } from 'electron';
import type { CalendarEventRef } from '../../../shared/office/OfficeTypes';
import { MeetingIntegration } from '../integrations/MeetingIntegration';

export type PreMeetingNotification = {
  eventId: string;
  title: string;
  attendees: string[];
  startsAt: string;
  meetingLink?: string;
};

export class CalendarPollingService {
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingIntervalMs = 45000; // 45 seconds
  private preNotificationThresholdMs = 2 * 60 * 1000; // 2 minutes
  private recentlyNotified = new Set<string>(); // Track already-notified events
  private windowProvider: (() => BrowserWindow | null) | null = null;

  /**
   * Start polling for upcoming meetings
   */
  startPolling(userId: string, windowProvider: () => BrowserWindow | null): void {
    if (this.pollingInterval) return; // Already polling

    this.windowProvider = windowProvider;

    this.pollingInterval = setInterval(() => {
      this.checkUpcomingMeetings(userId).catch((error) => {
        console.error('Calendar polling error:', error);
      });
    }, this.pollingIntervalMs);

    console.log(`[CalendarPolling] Started polling for user ${userId}`);
  }

  /**
   * Stop polling for meetings
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[CalendarPolling] Stopped polling');
    }
    this.recentlyNotified.clear();
  }

  /**
   * Check for meetings starting in ~2 minutes
   */
  private async checkUpcomingMeetings(userId: string): Promise<void> {
    try {
      // Get upcoming meetings for next 15 minutes
      const upcomingMeetings = await MeetingIntegration.listUpcomingMeetings(userId, 1);

      const now = Date.now();
      const twoMinutesMs = 2 * 60 * 1000;
      const fifteenMinutesMs = 15 * 60 * 1000;

      for (const meeting of upcomingMeetings) {
        try {
          const meetingStart = new Date(meeting.startsAt).getTime();
          const timeUntilMeeting = meetingStart - now;

          // Check if meeting is starting in ~2 minutes (within 90 seconds before to 30 seconds after)
          if (
            timeUntilMeeting <= twoMinutesMs + 30 * 1000 &&
            timeUntilMeeting >= twoMinutesMs - 90 * 1000 &&
            !this.recentlyNotified.has(meeting.id)
          ) {
            // Mark as notified to avoid duplicate notifications
            this.recentlyNotified.add(meeting.id);

            // Send notification
            this.sendPreMeetingNotification({
              eventId: meeting.id,
              title: meeting.title,
              attendees: meeting.attendees,
              startsAt: meeting.startsAt,
              meetingLink: meeting.webUrl,
            });

            // Clear from notified set after 30 minutes (in case user delays)
            setTimeout(() => {
              this.recentlyNotified.delete(meeting.id);
            }, 30 * 60 * 1000);
          }
        } catch (error) {
          console.error(`Error processing meeting ${meeting.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[CalendarPolling] Error checking upcoming meetings:', error);
    }
  }

  /**
   * Send pre-meeting notification to renderer
   */
  private sendPreMeetingNotification(notification: PreMeetingNotification): void {
    try {
      const win = this.windowProvider?.();
      if (!win || win.isDestroyed()) {
        console.warn('[CalendarPolling] No active window to send notification');
        return;
      }

      win.webContents.send('meeting:preNotification', notification);
      console.log(`[CalendarPolling] Sent pre-meeting notification: ${notification.title}`);
    } catch (error) {
      console.error('[CalendarPolling] Failed to send notification:', error);
    }
  }

  /**
   * Clear notification cache (e.g., when user signs out)
   */
  clearCache(): void {
    this.recentlyNotified.clear();
  }

  /**
   * Set custom polling interval (for testing)
   */
  setPollingInterval(ms: number): void {
    this.pollingIntervalMs = ms;
    if (this.pollingInterval) {
      // Restart polling with new interval
      const userId = 'unknown'; // We don't have userId here in this design
      this.stopPolling();
      // Caller must restart with proper userId
    }
  }
}

export const calendarPollingService = new CalendarPollingService();
