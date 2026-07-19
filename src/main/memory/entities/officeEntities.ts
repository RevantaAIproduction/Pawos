import { memoryGraphStore, type Entity } from '../MemoryGraphStore';

/**
 * Office Memory — the same generic Memory Graph every other runtime writes
 * into (see infrastructureEntities.ts for the established upsert-by-
 * natural-key precedent), extended with the entity types the Office
 * Intelligence Runtime needs: documents, spreadsheets, presentations, and
 * calendar events. Metadata only by default — path/title/counts, never
 * document body content, matching "store only metadata unless users
 * explicitly choose content indexing." Office Intelligence deliberately
 * reuses infrastructureEntities.ts's `project` entity for "projects" and
 * CommunicationMemoryStore's participant/company records for contacts —
 * no duplicate identity concepts.
 */

export type DocumentAttributes = { path: string; title?: string; format: string; createdAt: number };
export type SpreadsheetAttributes = { path: string; title?: string; sheetCount?: number; createdAt: number };
export type PresentationAttributes = { path: string; title?: string; slideCount?: number; createdAt: number };
export type CalendarEventAttributes = { title: string; startsAt: string; endsAt: string; attendees: string[]; provider?: string };
/** Recorded only after the user explicitly confirms a browser-compose email was actually sent — same discipline as ConfirmEmailSentPlugin, just not tied to a communication session. */
export type EmailAttributes = { recipient: string; subject: string; sentAt: number };

function normalizePath(p: string): string {
  return p.trim().toLowerCase();
}

export function findDocument(filePath: string): Entity | undefined {
  const target = normalizePath(filePath);
  return memoryGraphStore.queryEntities({ type: 'document', where: (a) => normalizePath((a as DocumentAttributes).path) === target })[0];
}

export function upsertDocument(attributes: DocumentAttributes): Entity {
  const existing = findDocument(attributes.path);
  return memoryGraphStore.upsertEntity('document', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findSpreadsheet(filePath: string): Entity | undefined {
  const target = normalizePath(filePath);
  return memoryGraphStore.queryEntities({ type: 'spreadsheet', where: (a) => normalizePath((a as SpreadsheetAttributes).path) === target })[0];
}

export function upsertSpreadsheet(attributes: SpreadsheetAttributes): Entity {
  const existing = findSpreadsheet(attributes.path);
  return memoryGraphStore.upsertEntity('spreadsheet', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function findPresentation(filePath: string): Entity | undefined {
  const target = normalizePath(filePath);
  return memoryGraphStore.queryEntities({ type: 'presentation', where: (a) => normalizePath((a as PresentationAttributes).path) === target })[0];
}

export function upsertPresentation(attributes: PresentationAttributes): Entity {
  const existing = findPresentation(attributes.path);
  return memoryGraphStore.upsertEntity('presentation', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Every calendar event is its own new entity (a real history of scheduled events, not one mutable record). */
export function recordCalendarEvent(attributes: CalendarEventAttributes): Entity {
  return memoryGraphStore.upsertEntity('calendarEvent', attributes, { changeType: 'created' });
}

/** Every confirmed-sent email is its own new entity — a real history, not a mutable "last email" record. */
export function recordSentEmail(attributes: EmailAttributes): Entity {
  return memoryGraphStore.upsertEntity('email', attributes, { changeType: 'created' });
}

export function listRecentOfficeFiles(limit = 10): Entity[] {
  const all = [
    ...memoryGraphStore.queryEntities({ type: 'document' }),
    ...memoryGraphStore.queryEntities({ type: 'spreadsheet' }),
    ...memoryGraphStore.queryEntities({ type: 'presentation' }),
  ];
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}
