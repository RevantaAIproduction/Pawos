import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { ErrorMemoryEntry } from '../../shared/actions/ErrorMemoryTypes';

const FILE_NAME = 'error-memory.json';
const MAX_ENTRIES = 500;

/** Very deliberately simple: lowercased substring overlap on problem/cause text, not embeddings/fuzzy matching — a real, explainable signal rather than a black-box "similarity" score. */
function scoreMatch(entry: ErrorMemoryEntry, problem: string): number {
  const needle = problem.toLowerCase();
  const haystack = `${entry.problem} ${entry.cause}`.toLowerCase();
  const needleWords = needle.split(/\W+/).filter((w) => w.length > 3);
  if (needleWords.length === 0) return 0;
  const matches = needleWords.filter((w) => haystack.includes(w));
  return matches.length / needleWords.length;
}

/**
 * Electron's memory of past fixes — same persistence shape as
 * ConversationSessionStore/WorkspaceMemoryStore. Entries are only ever
 * written by the model explicitly calling recordErrorFix once IT has
 * judged a fix worked (not auto-detected from success/failure patterns in
 * code — "this fix worked" is a semantic judgment the model is better
 * positioned to make than a heuristic).
 */
class ErrorMemoryStore {
  private filePath = '';
  private entries: ErrorMemoryEntry[] = [];

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

  record(entry: Omit<ErrorMemoryEntry, 'id' | 'occurredAt'>): ErrorMemoryEntry {
    const record: ErrorMemoryEntry = { ...entry, id: uuidv4(), occurredAt: Date.now() };
    this.entries.push(record);
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    this.save();
    return record;
  }

  findSimilar(problem: string, workspaceRoot?: string, limit = 5): ErrorMemoryEntry[] {
    const pool = workspaceRoot ? this.entries.filter((e) => e.workspaceRoot === workspaceRoot) : this.entries;
    return pool
      .map((entry) => ({ entry, score: scoreMatch(entry, problem) }))
      .filter(({ score }) => score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ entry }) => entry);
  }
}

export const errorMemoryStore = new ErrorMemoryStore();
