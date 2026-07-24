import type { BrowserWindow } from 'electron';
import { ratingPromptStore } from './RatingPromptStore';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/**
 * Fires once, 3 hours after this call (i.e. 3 hours of the app running
 * continuously since launch) — never cumulative across separate sessions.
 * Skipped entirely if the user already rated or chose "don't ask again".
 */
export function startRatingPromptScheduler(getWindow: () => BrowserWindow | null): void {
  const state = ratingPromptStore.get();
  if (state.dontAskAgain || state.hasRated) return;

  setTimeout(() => {
    const current = ratingPromptStore.get();
    if (current.dontAskAgain || current.hasRated) return;
    ratingPromptStore.markPrompted();
    getWindow()?.webContents.send('feedback:showRatingPrompt');
  }, THREE_HOURS_MS);
}
