import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';

const FILE_NAME = 'guest-connector-credentials.json';

type StoredFile = { [connectorId: string]: { [fieldName: string]: string } };

/**
 * Local, OS-keychain-backed (via Electron `safeStorage`) fallback credential store for Guest-mode
 * sessions, which have no Supabase session to persist through `ConnectivityCredentialService`'s
 * Vault. Generic over connector id and field set — not Jira-specific — so a future inline
 * provider can reuse it without a new store. Signed-in sessions never use this; their credentials
 * live in the Supabase Vault instead.
 */
class GuestConnectorCredentialStore {
  private file = '';

  init(): void {
    this.file = path.join(app.getPath('userData'), FILE_NAME);
  }

  private readAll(): StoredFile {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      return {};
    }
  }

  private writeAll(data: StoredFile): void {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf-8');
  }

  save(connectorId: string, fields: Record<string, string>): void {
    const all = this.readAll();
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      encrypted[key] = safeStorage.encryptString(value).toString('base64');
    }
    all[connectorId] = encrypted;
    this.writeAll(all);
  }

  load(connectorId: string): Record<string, string> | undefined {
    const encrypted = this.readAll()[connectorId];
    if (!encrypted) return undefined;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(encrypted)) {
      try {
        fields[key] = safeStorage.decryptString(Buffer.from(value, 'base64'));
      } catch {
        return undefined; // corrupt/undecryptable entry — treat as "nothing saved" rather than throw
      }
    }
    return fields;
  }

  remove(connectorId: string): void {
    const all = this.readAll();
    delete all[connectorId];
    this.writeAll(all);
  }
}

export const guestConnectorCredentialStore = new GuestConnectorCredentialStore();
