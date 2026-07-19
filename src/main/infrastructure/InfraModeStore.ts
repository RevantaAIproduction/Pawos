import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type InfraMode = 'investigate' | 'full';
export type InfraModePreferences = { mode: InfraMode; updatedAt: number };

const FILE_NAME = 'infra-mode.json';
const DEFAULT_MODE: InfraMode = 'investigate';

/**
 * Same local-preference pattern as CodingModeStore (Paw Go/Pro) — not
 * billing, not an entitlement. "Read-only investigation mode" from the
 * Infrastructure Runtime spec: defaults to 'investigate' (tickets, status
 * checks, health checks — never deploys/rolls back) until the user
 * explicitly switches to 'full'.
 */
class InfraModeStore {
  private filePath = '';
  private preferences: InfraModePreferences | null = null;

  init(): void {
    this.filePath = path.join(app.getPath('userData'), 'infrastructure', FILE_NAME);
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

  getMode(): InfraMode {
    return this.preferences?.mode ?? DEFAULT_MODE;
  }

  get(): InfraModePreferences {
    return this.preferences ?? { mode: DEFAULT_MODE, updatedAt: 0 };
  }

  setMode(mode: InfraMode): InfraModePreferences {
    this.preferences = { mode, updatedAt: Date.now() };
    this.persist();
    return this.preferences;
  }
}

export const infraModeStore = new InfraModeStore();
