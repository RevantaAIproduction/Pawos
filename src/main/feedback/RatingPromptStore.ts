import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type RatingPromptState = { dontAskAgain: boolean; hasRated: boolean; lastPromptedAt: number | null };

const FILE_NAME = 'rating-prompt.json';

function defaultState(): RatingPromptState {
  return { dontAskAgain: false, hasRated: false, lastPromptedAt: null };
}

/** Whether/when the user has been shown or has dismissed the 3-hour rating prompt — see RatingPromptScheduler.ts. */
class RatingPromptStore {
  private file = '';
  private state: RatingPromptState = defaultState();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'feedback', FILE_NAME);
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

  get(): RatingPromptState {
    return this.state;
  }

  markPrompted(): RatingPromptState {
    this.state = { ...this.state, lastPromptedAt: Date.now() };
    this.save();
    return this.state;
  }

  markRated(): RatingPromptState {
    this.state = { ...this.state, hasRated: true };
    this.save();
    return this.state;
  }

  setDontAskAgain(value: boolean): RatingPromptState {
    this.state = { ...this.state, dontAskAgain: value };
    this.save();
    return this.state;
  }
}

export const ratingPromptStore = new RatingPromptStore();
