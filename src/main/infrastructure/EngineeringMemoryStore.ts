import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { EngineeringMemoryEntry } from '../../shared/infrastructure/EngineeringMemoryTypes';

const FILE_NAME = 'engineering-memory.json';
/** Same bound-and-drop-oldest discipline as ExecutionMemoryStore. */
const MAX_ENTRIES = 1000;

/**
 * Persisted log of deployments/rollbacks/incidents/root causes — the
 * Infrastructure Runtime's own equivalent of ExecutionMemoryStore, same
 * JSON-in-userData singleton pattern. Lets Paw answer "what did we deploy
 * last," "has this failed before," "what was the root cause last time"
 * without re-investigating from scratch every time.
 */
class EngineeringMemoryStore {
  private filePath = '';
  private entries: EngineeringMemoryEntry[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
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

  record(entry: EngineeringMemoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    this.save();
  }

  list(): EngineeringMemoryEntry[] {
    return [...this.entries].sort((a, b) => b.at - a.at);
  }

  /** Most recent entry of a kind for a given service — e.g. "the last deployment of checkout-api". */
  latestForService(kind: EngineeringMemoryEntry['kind'], serviceName: string): EngineeringMemoryEntry | undefined {
    const target = serviceName.trim().toLowerCase();
    return this.list().find((e) => e.kind === kind && e.serviceName?.trim().toLowerCase() === target);
  }

  /** Every deployment recorded for a service, newest first — index 1 is "the one before the current deploy," which is what a rollback actually reverts to. */
  deploymentsForService(serviceName: string): EngineeringMemoryEntry[] {
    const target = serviceName.trim().toLowerCase();
    return this.list().filter((e) => e.kind === 'deployment' && e.serviceName?.trim().toLowerCase() === target);
  }

  /** Every entry recorded for a service, newest first — precise exact-name matching (unlike search(), which is a fuzzy text match over summary/detail too). Used to surface prior engineering knowledge before treating an issue as first-time. */
  relatedTo(serviceName: string, excludeId?: string): EngineeringMemoryEntry[] {
    const target = serviceName.trim().toLowerCase();
    return this.list().filter((e) => e.id !== excludeId && (e.serviceName?.trim().toLowerCase() === target || e.affectedServices?.some((s) => s.trim().toLowerCase() === target)));
  }

  search(text: string): EngineeringMemoryEntry[] {
    const target = text.trim().toLowerCase();
    if (!target) return [];
    return this.list().filter(
      (e) =>
        e.summary.toLowerCase().includes(target) ||
        e.detail?.toLowerCase().includes(target) ||
        e.serviceName?.toLowerCase().includes(target) ||
        e.repositoryFullName?.toLowerCase().includes(target)
    );
  }
}

export const engineeringMemoryStore = new EngineeringMemoryStore();
