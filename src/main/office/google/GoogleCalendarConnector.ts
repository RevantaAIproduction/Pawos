import type { CalendarEventDraft, CalendarEventRef, CalendarProviderConnector, ConnectorResult, FreeBusySlot } from '../../../shared/office/OfficeTypes';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

type GCalEvent = {
  id: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
};

function toEventRef(e: GCalEvent): CalendarEventRef {
  return {
    id: e.id,
    title: e.summary ?? '(no title)',
    startsAt: e.start?.dateTime ?? e.start?.date ?? '',
    endsAt: e.end?.dateTime ?? e.end?.date ?? '',
    attendees: (e.attendees ?? []).map((a) => a.email),
    webUrl: e.htmlLink,
  };
}

/** Real Google Calendar v3 REST connector — plain fetch + Bearer token, no googleapis dependency. */
export class GoogleCalendarConnector implements CalendarProviderConnector {
  readonly id = 'googleCalendar' as const;
  readonly displayName = 'Google Calendar';

  constructor(private accessToken: string | undefined) {}

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Google Calendar is not connected. Connect Google Workspace to enable it.' };
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  }

  async listUpcomingEvents(withinDays: number): Promise<ConnectorResult<{ events: CalendarEventRef[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const now = new Date();
      const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      });
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Google Calendar API returned ${res.status}` };
      const data = (await res.json()) as { items: GCalEvent[] };
      return { ok: true, events: data.items.map(toEventRef) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Calendar: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async findFreeSlots(attendees: string[], durationMinutes: number, withinDays: number): Promise<ConnectorResult<{ slots: FreeBusySlot[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const now = new Date();
      const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
      const calendarIds = attendees.length > 0 ? attendees : ['primary'];
      const res = await fetch(`${CALENDAR_API}/freeBusy`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          timeMin: now.toISOString(),
          timeMax: until.toISOString(),
          items: calendarIds.map((id) => ({ id })),
        }),
      });
      if (!res.ok) return { ok: false, reason: `Google Calendar API returned ${res.status} for free/busy` };
      const data = (await res.json()) as { calendars: Record<string, { busy: { start: string; end: string }[] }> };

      // Merge every calendar's busy blocks into one sorted timeline, then take the gaps ≥ the
      // requested duration — a real computation over the API's real response, not a guess.
      const busy = Object.values(data.calendars)
        .flatMap((c) => c.busy)
        .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
        .sort((a, b) => a.start - b.start);

      const slots: FreeBusySlot[] = [];
      let cursor = now.getTime();
      const endBound = until.getTime();
      const durationMs = durationMinutes * 60 * 1000;
      for (const block of busy) {
        if (block.start - cursor >= durationMs) {
          slots.push({ start: new Date(cursor).toISOString(), end: new Date(block.start).toISOString() });
        }
        cursor = Math.max(cursor, block.end);
      }
      if (endBound - cursor >= durationMs) {
        slots.push({ start: new Date(cursor).toISOString(), end: new Date(endBound).toISOString() });
      }
      return { ok: true, slots };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Calendar: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async createEvent(draft: CalendarEventDraft): Promise<ConnectorResult<{ event: CalendarEventRef }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          summary: draft.title,
          description: draft.description,
          start: { dateTime: draft.startsAt },
          end: { dateTime: draft.endsAt },
          attendees: draft.attendees.map((email) => ({ email })),
          recurrence: draft.recurrence ? [draft.recurrence] : undefined,
        }),
      });
      if (!res.ok) return { ok: false, reason: `Google Calendar API returned ${res.status} for event creation` };
      const event = (await res.json()) as GCalEvent;
      return { ok: true, event: toEventRef(event) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Calendar: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async rescheduleEvent(eventId: string, startsAt: string, endsAt: string): Promise<ConnectorResult<{ event: CalendarEventRef }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ start: { dateTime: startsAt }, end: { dateTime: endsAt } }),
      });
      if (!res.ok) return { ok: false, reason: `Google Calendar API returned ${res.status} for reschedule` };
      const event = (await res.json()) as GCalEvent;
      return { ok: true, event: toEventRef(event) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Google Calendar: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
