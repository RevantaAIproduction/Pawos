/**
 * Shared types for the Office Intelligence Runtime — a connector-based layer
 * so Paw can create/edit/organize documents, spreadsheets, presentations,
 * and email without the user ever needing to name Word vs. Google Docs vs.
 * a plain .docx file. Mirrors the Infrastructure Runtime's connector
 * pattern exactly (InfrastructureConnectorRegistry.ts) — one small
 * interface per connector kind, real implementations register themselves,
 * an honest "not configured" result is always possible instead of a
 * fabricated one.
 */

export type DocumentProviderId = 'googleDrive' | 'oneDrive' | 'iCloudDrive' | 'localFileSystem';
export type EmailProviderId = 'gmail' | 'outlook' | 'microsoft365' | 'googleWorkspace' | 'default';
export type CalendarProviderId = 'googleCalendar' | 'outlookCalendar' | 'appleCalendar';

export type ConnectorResult<T> = ({ ok: true } & T) | { ok: false; reason: string };

export type OfficeFileRef = { id: string; name: string; mimeType: string; webUrl?: string; modifiedAt?: string };

export interface DocumentProviderConnector {
  readonly id: DocumentProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  listFiles(query?: string): Promise<ConnectorResult<{ files: OfficeFileRef[] }>>;
  readFile(fileId: string): Promise<ConnectorResult<{ content: string; mimeType: string }>>;
  uploadFile(name: string, localPath: string): Promise<ConnectorResult<{ file: OfficeFileRef }>>;
}

export type CalendarEventDraft = { title: string; startsAt: string; endsAt: string; attendees: string[]; description?: string; recurrence?: string };
export type CalendarEventRef = { id: string; title: string; startsAt: string; endsAt: string; attendees: string[]; webUrl?: string };
export type FreeBusySlot = { start: string; end: string };

export interface CalendarProviderConnector {
  readonly id: CalendarProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  listUpcomingEvents(withinDays: number): Promise<ConnectorResult<{ events: CalendarEventRef[] }>>;
  findFreeSlots(attendees: string[], durationMinutes: number, withinDays: number): Promise<ConnectorResult<{ slots: FreeBusySlot[] }>>;
  createEvent(draft: CalendarEventDraft): Promise<ConnectorResult<{ event: CalendarEventRef }>>;
  rescheduleEvent(eventId: string, startsAt: string, endsAt: string): Promise<ConnectorResult<{ event: CalendarEventRef }>>;
}

/** Read-only inbox access — never sends. Sending stays exclusively the browser-compose + explicit-confirmation flow (see MailComposeUrl.ts), never an API call. */
export interface MailboxProviderConnector {
  readonly id: EmailProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  listRecentThreads(maxResults: number): Promise<ConnectorResult<{ threads: { id: string; subject: string; snippet: string; from: string; at: string }[] }>>;
  readThread(threadId: string): Promise<ConnectorResult<{ subject: string; messages: { from: string; at: string; body: string }[] }>>;
}
