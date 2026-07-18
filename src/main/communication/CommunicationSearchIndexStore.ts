import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SearchIndexEntry } from '../../shared/communication/CommunicationTypes';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';
import { communicationMemoryStore } from './CommunicationMemoryStore';

const FILE_NAME = 'search.db';

/**
 * Cross-entity search index (index/search.db, desktop-first storage
 * architecture) — a real, persisted, denormalized cache of everything
 * searchable: communications, action items, decisions, follow-ups,
 * contacts, companies. Rebuilt incrementally (indexSession/indexContact/
 * indexCompany are idempotent — always remove-then-reinsert this entity's
 * own rows first) rather than reconstructed from scratch on every search,
 * so CommunicationSearch.ts never needs to re-read transcript files from
 * disk on each query as the number of sessions grows.
 */
class CommunicationSearchIndexStore {
  private filePath = '';
  private entries: SearchIndexEntry[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), 'communication', 'index', FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ entries: this.entries }, null, 2), 'utf-8');
  }

  list(): SearchIndexEntry[] {
    return [...this.entries];
  }

  /** Indexes one finished session — the real communication itself plus its real action items/decisions/follow-ups, using the real transcript/summary already on disk. Removes any stale rows for this communicationId first, so reprocessing never duplicates entries. */
  indexSession(communicationId: string): void {
    this.entries = this.entries.filter((e) => e.communicationId !== communicationId || e.kind === 'contact' || e.kind === 'company');
    const record = communicationSessionStore.get(communicationId);
    if (!record) return this.save();

    const summary = communicationIntelligenceStore.getSummary(communicationId);
    const transcript = record.transcriptPath ? communicationSessionStore.readTextFile(record.transcriptPath) ?? '' : '';
    const communicationText = [record.title, summary?.headline, summary?.summary, summary?.keyPoints.join(' '), summary?.executiveSummary, transcript].filter(Boolean).join('\n');
    this.entries.push({
      id: communicationId,
      kind: 'communication',
      text: communicationText,
      headline: summary?.headline || record.title,
      communicationId,
      occurredAt: record.startedAt,
    });

    for (const item of communicationIntelligenceStore.getActionItems(communicationId)) {
      this.entries.push({ id: item.id, kind: 'actionItem', text: item.description, headline: item.description, communicationId, occurredAt: record.startedAt });
    }
    for (const decision of communicationIntelligenceStore.getDecisions(communicationId)) {
      this.entries.push({ id: decision.id, kind: 'decision', text: decision.description, headline: decision.description, communicationId, occurredAt: record.startedAt });
    }
    for (const followUp of communicationIntelligenceStore.listFollowUps().filter((f) => f.communicationId === communicationId)) {
      this.entries.push({ id: followUp.id, kind: 'followUp', text: `${followUp.reason} ${followUp.suggestedAction}`, headline: followUp.suggestedAction, communicationId, occurredAt: record.startedAt });
    }

    this.save();
  }

  indexContact(participantId: string): void {
    this.entries = this.entries.filter((e) => e.id !== participantId);
    const participant = communicationMemoryStore.getParticipant(participantId);
    if (!participant) return this.save();
    const text = [participant.name, participant.role, ...participant.frequentTopics.map((t) => t.topic), participant.communicationStyle, ...participant.interests.map((i) => i.description)]
      .filter(Boolean)
      .join(' ');
    this.entries.push({ id: participantId, kind: 'contact', text, headline: participant.name, communicationId: null, occurredAt: participant.lastSeenAt });
    this.save();
  }

  indexCompany(companyId: string): void {
    this.entries = this.entries.filter((e) => e.id !== companyId);
    const company = communicationMemoryStore.getCompany(companyId);
    if (!company) return this.save();
    const text = [company.name, company.domain, ...company.frequentTopics.map((t) => t.topic), ...company.risks.map((r) => r.description), ...company.opportunities.map((o) => o.description)]
      .filter(Boolean)
      .join(' ');
    this.entries.push({ id: companyId, kind: 'company', text, headline: company.name, communicationId: null, occurredAt: company.relationshipHealth?.lastInteractionAt ?? 0 });
    this.save();
  }
}

export const communicationSearchIndexStore = new CommunicationSearchIndexStore();
