import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type CodingMode = 'go' | 'pro';
export type CodingModePreferences = { mode: CodingMode; updatedAt: number };

const FILE_NAME = 'coding-mode.json';
const DEFAULT_MODE: CodingMode = 'go';

/**
 * A plain local preference — not a purchased plan, not billing, not an
 * entitlement check. Defaults to 'go' (the safer, read-only mode) until the
 * user explicitly switches to 'pro'.
 */
class CodingModeStore {
  private filePath = '';
  private preferences: CodingModePreferences | null = null;

  init(): void {
    this.filePath = path.join(app.getPath('userData'), 'coding', FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.preferences = JSON.parse(raw);
    } catch {
      this.preferences = null;
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.preferences, null, 2), 'utf-8');
  }

  getMode(): CodingMode {
    return this.preferences?.mode ?? DEFAULT_MODE;
  }

  get(): CodingModePreferences {
    return this.preferences ?? { mode: DEFAULT_MODE, updatedAt: 0 };
  }

  setMode(mode: CodingMode): CodingModePreferences {
    this.preferences = { mode, updatedAt: Date.now() };
    this.persist();
    return this.preferences;
  }
}

export const codingModeStore = new CodingModeStore();
