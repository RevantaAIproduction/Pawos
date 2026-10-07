import type { Session } from "./supabaseAuth";

/** The part of VS Code's SecretStorage the extension uses (the operating system's keychain). */
export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export const SESSION_SECRET_KEY = "pawos.session";

/**
 * The signed-in session, kept only in SecretStorage — never in settings, workspace state, a file
 * or the log. A stored value that doesn't look like a session is treated as no session.
 */
export class SessionStore {
  constructor(private readonly secrets: SecretStore) {}

  async read(): Promise<Session | null> {
    const raw = await this.secrets.get(SESSION_SECRET_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<Session> | null;
      if (!value || typeof value.accessToken !== "string" || !value.accessToken || typeof value.refreshToken !== "string" || !value.refreshToken || typeof value.expiresAt !== "number") {
        return null;
      }
      return { accessToken: value.accessToken, refreshToken: value.refreshToken, expiresAt: value.expiresAt, email: typeof value.email === "string" ? value.email : null };
    } catch {
      return null;
    }
  }

  async write(session: Session): Promise<void> {
    await this.secrets.store(SESSION_SECRET_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SESSION_SECRET_KEY);
  }
}
