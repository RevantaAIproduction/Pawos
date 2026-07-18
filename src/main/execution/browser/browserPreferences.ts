import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { BrowserId } from '../../../shared/actions/ActionTypes';

const FILE_NAME = 'browser-preferences.json';
const DEFAULT_ORDER: BrowserId[] = ['chrome', 'edge', 'brave', 'electron'];

/**
 * "Do not hardcode Chrome... Preferred order should be configurable." —
 * a small, dedicated, persisted store (same singleton/JSON/userData
 * pattern as every other store in this app) rather than hooking into the
 * unrelated renderer SettingsStore, which owns companion/UI preferences,
 * not browser automation ones.
 */
class BrowserPreferences {
  private filePath = '';
  private order: BrowserId[] = DEFAULT_ORDER;

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { preferredOrder?: BrowserId[] };
      if (Array.isArray(parsed.preferredOrder) && parsed.preferredOrder.length > 0) {
        this.order = parsed.preferredOrder;
      }
    } catch {
      this.order = DEFAULT_ORDER;
    }
  }

  getPreferredOrder(): BrowserId[] {
    return this.order;
  }

  setPreferredOrder(order: BrowserId[]): void {
    this.order = order;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ preferredOrder: this.order }, null, 2), 'utf-8');
  }
}

export const browserPreferences = new BrowserPreferences();
