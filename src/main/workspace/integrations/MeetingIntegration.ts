/**
 * Meeting Integration Helper — bridges meeting operations with Google Calendar
 * and other calendar providers. Handles scheduling, recording, and distribution.
 */

import { IntegrationService } from '../services/IntegrationService';
import { GoogleCalendarConnector } from '../../office/google/GoogleCalendarConnector';
import type { CalendarEventDraft, CalendarEventRef } from '../../../shared/office/OfficeTypes';

export class MeetingIntegration {
  /**
   * Create a calendar event for a meeting
   */
  static async createCalendarEvent(userId: string, eventDraft: CalendarEventDraft): Promise<CalendarEventRef | null> {
    try {
      const token = await IntegrationService.getAccessToken(userId, 'googleCalendar');
      if (!token) return null;

      const connector = new GoogleCalendarConnector(token);
      const result = await connector.createEvent(eventDraft);

      return result.ok ? result.event : null;
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return null;
    }
  }

  /**
   * List upcoming meetings from calendar
   */
  static async listUpcomingMeetings(userId: string, withinDays: number = 7): Promise<CalendarEventRef[]> {
    try {
      const token = await IntegrationService.getAccessToken(userId, 'googleCalendar');
      if (!token) return [];

      const connector = new GoogleCalendarConnector(token);
      const result = await connector.listUpcomingEvents(withinDays);

      return result.ok ? result.events : [];
    } catch (error) {
      console.error('Failed to list upcoming meetings:', error);
      return [];
    }
  }

  /**
   * Find free slots for scheduling a meeting
   */
  static async findFreeSlots(
    userId: string,
    attendees: string[],
    durationMinutes: number,
    withinDays: number = 7
  ): Promise<Array<{ start: string; end: string }>> {
    try {
      const token = await IntegrationService.getAccessToken(userId, 'googleCalendar');
      if (!token) return [];

      const connector = new GoogleCalendarConnector(token);
      const result = await connector.findFreeSlots(attendees, durationMinutes, withinDays);

      return result.ok ? result.slots : [];
    } catch (error) {
      console.error('Failed to find free slots:', error);
      return [];
    }
  }

  /**
   * Reschedule a calendar event
   */
  static async rescheduleEvent(
    userId: string,
    eventId: string,
    startsAt: string,
    endsAt: string
  ): Promise<CalendarEventRef | null> {
    try {
      const token = await IntegrationService.getAccessToken(userId, 'googleCalendar');
      if (!token) return null;

      const connector = new GoogleCalendarConnector(token);
      const result = await connector.rescheduleEvent(eventId, startsAt, endsAt);

      return result.ok ? result.event : null;
    } catch (error) {
      console.error('Failed to reschedule event:', error);
      return null;
    }
  }

  /**
   * Check if Google Calendar is connected for a user
   */
  static isCalendarConnected(userId: string): boolean {
    return IntegrationService.isConnected(userId, 'googleCalendar');
  }

  /**
   * Get calendar connection details
   */
  static getCalendarConnection(userId: string) {
    return IntegrationService.getConnection(userId, 'googleCalendar');
  }
}
