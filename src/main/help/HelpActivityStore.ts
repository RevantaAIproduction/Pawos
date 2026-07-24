import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type HelpActivityState = {
  viewCounts: Record<string, number>;
  /** Most-recently-viewed first, capped at 20. */
  recentlyViewed: string[];
};

const FILE_NAME = 'help-activity.json';

function defaultState(): HelpActivityState {
  return { viewCounts: {}, recentlyViewed: [] };
}

class HelpActivityStore {
  private file = '';
  private state: HelpActivityState = defaultState();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'help', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.state = { ...defaultState(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  get(): HelpActivityState {
    return this.state;
  }

  recordView(articleId: string): HelpActivityState {
    const viewCounts = { ...this.state.viewCounts, [articleId]: (this.state.viewCounts[articleId] ?? 0) + 1 };
    const recentlyViewed = [articleId, ...this.state.recentlyViewed.filter((id) => id !== articleId)].slice(0, 20);
    this.state = { viewCounts, recentlyViewed };
    this.save();
    return this.state;
  }
}

export const helpActivityStore = new HelpActivityStore();
