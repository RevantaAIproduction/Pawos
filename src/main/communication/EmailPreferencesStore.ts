import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { EmailPreferences, EmailProviderKind } from '../../shared/communication/CommunicationTypes';

const FILE_NAME = 'email-preferences.json';

/**
 * A plain, unauthenticated preference — not a login, not a connected
 * account, not a credential. Just tells Paw which provider's compose URL
 * to build when opening a follow-up email in the user's own browser. Paw
 * never stores SMTP/OAuth credentials and never authenticates with any
 * email provider anywhere in this runtime.
 */
class EmailPreferencesStore {
  private filePath = '';
  private preferences: EmailPreferences | null = null;

  init(): void {
    this.filePath = path.join(app.getPath('userData'), 'communication', 'index', FILE_NAME);
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

  get(): EmailPreferences | null {
    return this.preferences;
  }

  save(input: { displayName: string; emailAddress: string; provider: EmailProviderKind }): EmailPreferences {
    this.preferences = { ...input, savedAt: Date.now() };
    this.persist();
    return this.preferences;
  }
}

export const emailPreferencesStore = new EmailPreferencesStore();
