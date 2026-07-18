import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ActionItem, CommunicationSignal, CommunicationSummary, Decision, FollowUp, SyncState } from '../../shared/communication/CommunicationTypes';
import { communicationSessionStore } from './CommunicationSessionStore';

const FILE_NAME = 'intelligence.db';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Intelligence Layer output storage (architecture doc §11) — every value
 * here is real, structured output from the pipeline (CommunicationPipeline.ts),
 * never invented. Kept distinct from CommunicationSessionStore's own
 * metadata since these are derived-from-transcript facts, not capture
 * metadata, mirroring the storage layer's binary/structured split.
 */
class CommunicationIntelligenceStore {
  private filePath = '';
  private summaries: CommunicationSummary[] = [];
  private actionItems: ActionItem[] = [];
  private followUps: FollowUp[] = [];
  private signals: CommunicationSignal[] = [];
  private decisions: Decision[] = [];
  private syncStates: SyncState[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), 'communication', 'index', FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.summaries = Array.isArray(parsed.summaries) ? parsed.summaries : [];
      this.actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
      this.followUps = Array.isArray(parsed.followUps) ? parsed.followUps : [];
      this.signals = Array.isArray(parsed.signals) ? parsed.signals : [];
      this.decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      this.syncStates = Array.isArray(parsed.syncStates) ? parsed.syncStates : [];
    } catch {
      this.summaries = [];
      this.actionItems = [];
      this.followUps = [];
      this.signals = [];
      this.decisions = [];
      this.syncStates = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(
        { summaries: this.summaries, actionItems: this.actionItems, followUps: this.followUps, signals: this.signals, decisions: this.decisions, syncStates: this.syncStates },
        null,
        2
      ),
      'utf-8'
    );
  }

  setSummary(summary: CommunicationSummary): void {
    this.summaries = this.summaries.filter((s) => s.communicationId !== summary.communicationId);
    this.summaries.push(summary);
    this.save();
  }
  getSummary(communicationId: string): CommunicationSummary | undefined {
    return this.summaries.find((s) => s.communicationId === communicationId);
  }

  addActionItems(communicationId: string, items: Omit<ActionItem, 'id' | 'communicationId' | 'status'>[]): ActionItem[] {
    const created = items.map((item) => ({ ...item, id: newId('action'), communicationId, status: 'open' as const }));
    this.actionItems.push(...created);
    this.save();
    this.writeSessionActionItems(communicationId);
    return created;
  }
  getActionItems(communicationId: string): ActionItem[] {
    return this.actionItems.filter((a) => a.communicationId === communicationId);
  }
  setActionItemStatus(id: string, status: ActionItem['status']): ActionItem | undefined {
    const item = this.actionItems.find((a) => a.id === id);
    if (!item) return undefined;
    item.status = status;
    this.save();
    this.writeSessionActionItems(item.communicationId);
    return item;
  }
  private writeSessionActionItems(communicationId: string): void {
    communicationSessionStore.writeSessionJson(communicationId, 'action-items.json', this.getActionItems(communicationId));
  }
  listOpenActionItemsForCommunications(communicationIds: string[]): ActionItem[] {
    const set = new Set(communicationIds);
    return this.actionItems.filter((a) => set.has(a.communicationId) && a.status === 'open');
  }

  addFollowUps(communicationId: string, items: Omit<FollowUp, 'id' | 'communicationId'>[]): FollowUp[] {
    const created = items.map((item) => ({ ...item, id: newId('followup'), communicationId }));
    this.followUps.push(...created);
    this.save();
    communicationSessionStore.writeSessionJson(communicationId, 'followups.json', this.followUps.filter((f) => f.communicationId === communicationId));
    return created;
  }
  listFollowUps(): FollowUp[] {
    return [...this.followUps];
  }

  addSignals(signals: CommunicationSignal[]): void {
    this.signals.push(...signals);
    this.save();
    for (const communicationId of new Set(signals.map((s) => s.communicationId))) {
      communicationSessionStore.writeSessionJson(communicationId, 'signals.json', this.getSignals(communicationId));
    }
  }
  getSignals(communicationId: string): CommunicationSignal[] {
    return this.signals.filter((s) => s.communicationId === communicationId);
  }

  addDecisions(communicationId: string, items: Omit<Decision, 'id' | 'communicationId'>[]): Decision[] {
    const created = items.map((item) => ({ ...item, id: newId('decision'), communicationId }));
    this.decisions.push(...created);
    this.save();
    communicationSessionStore.writeSessionJson(communicationId, 'decisions.json', this.getDecisions(communicationId));
    return created;
  }
  getDecisions(communicationId: string): Decision[] {
    return this.decisions.filter((d) => d.communicationId === communicationId);
  }

  setSyncState(state: SyncState): void {
    this.syncStates = this.syncStates.filter((s) => !(s.communicationId === state.communicationId && s.connectorId === state.connectorId));
    this.syncStates.push(state);
    this.save();
  }
  getSyncState(communicationId: string, connectorId: string): SyncState | undefined {
    return this.syncStates.find((s) => s.communicationId === communicationId && s.connectorId === connectorId);
  }
}

export const communicationIntelligenceStore = new CommunicationIntelligenceStore();
