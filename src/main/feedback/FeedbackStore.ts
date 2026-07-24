import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type FeedbackEntry = { rating: number; comment?: string; submittedAt: number; appVersion: string };

const FILE_NAME = 'feedback.json';

/** Append-only local record of submitted ratings/feedback — see EMAIL delivery in ipc.ts's feedback:submit handler. */
class FeedbackStore {
  private file = '';
  private entries: FeedbackEntry[] = [];

  init(): void {
    this.file = path.join(app.getPath('userData'), 'feedback', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.entries = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      this.entries = [];
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  list(): FeedbackEntry[] {
    return this.entries;
  }

  append(entry: FeedbackEntry): FeedbackEntry {
    this.entries = [...this.entries, entry];
    this.save();
    return entry;
  }
}

export const feedbackStore = new FeedbackStore();
