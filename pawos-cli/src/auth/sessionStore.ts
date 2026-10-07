import * as fs from "fs";
import * as path from "path";
import type { Session, SessionStorage } from "../shared";

/**
 * Where the CLI keeps its session.
 *
 * What is kept: the refresh token and the account's email address — nothing else. The access token
 * is never written anywhere; it lives in memory for one run and is renewed at the start of the next.
 *
 * Where: the operating system's credential store — Windows Credential Manager, the macOS Keychain,
 * or the Secret Service (GNOME Keyring / KWallet) on Linux. Only when none of them is available
 * (a server with no desktop session, for example) does it fall back to a file in the CLI's own
 * directory that only the current user can read, and the CLI says so.
 */
export interface Keyring {
  get(): string | null;
  set(value: string): void;
  delete(): void;
}

export const KEYRING_SERVICE = "pawos-cli";
export const KEYRING_ACCOUNT = "session";
export const SESSION_FILE_NAME = "session.json";

/**
 * The credential-store entry for a PawOS address: "pawos-cli" for PawOS itself, and a separate
 * entry per host for any other (a local development server), so one never overwrites the other.
 */
export function keyringServiceFor(apiBaseUrl: string, defaultApiBaseUrl: string): string {
  if (apiBaseUrl === defaultApiBaseUrl) return KEYRING_SERVICE;
  try {
    return `${KEYRING_SERVICE}:${new URL(apiBaseUrl).host}`;
  } catch {
    return `${KEYRING_SERVICE}:other`;
  }
}

/** The operating system's credential store, or null when it can't be loaded on this machine. */
export function openSystemKeyring(service: string = KEYRING_SERVICE): Keyring | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Entry } = require("@napi-rs/keyring") as { Entry: new (service: string, account: string) => { getPassword(): string | null; setPassword(value: string): void; deletePassword(): boolean } };
    const entry = new Entry(service, KEYRING_ACCOUNT);
    return {
      get: () => entry.getPassword() ?? null,
      set: (value) => entry.setPassword(value),
      delete: () => void entry.deletePassword(),
    };
  } catch {
    return null;
  }
}

interface Persisted {
  refreshToken: string;
  email: string | null;
}

function parse(raw: string | null | undefined): Persisted | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Persisted> | null;
    if (!value || typeof value.refreshToken !== "string" || !value.refreshToken) return null;
    return { refreshToken: value.refreshToken, email: typeof value.email === "string" ? value.email : null };
  } catch {
    return null;
  }
}

export type StorageKind = "keychain" | "file" | "none";

/** The session could not be kept anywhere safe, so it was not kept at all. */
export class SessionStorageError extends Error {}

/** True when `file` is `folder` itself or anything inside it (any slash style; case-insensitive on Windows). */
export function isInside(file: string, folder: string, platform: string = process.platform): boolean {
  const normalise = (value: string) => {
    const resolved = path.resolve(value).replace(/[\\/]+/g, "/").replace(/\/+$/, "");
    return platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const inner = normalise(file);
  const outer = normalise(folder);
  return inner === outer || inner.startsWith(`${outer}/`);
}

export class CliSessionStore implements SessionStorage {
  /** This run's session, access token included. Never persisted. */
  private memory: Session | null = null;
  private kind: StorageKind | null = null;
  private readonly file: string;

  /**
   * `projectDirectory` is the folder the user is working in. The fallback file is never written
   * inside it: a session must not end up in a project, where it could be committed or shared.
   */
  constructor(
    private readonly keyring: Keyring | null,
    directory: string,
    private readonly projectDirectory: string | null = null
  ) {
    this.file = path.join(directory, SESSION_FILE_NAME);
  }

  /** Where the session is kept right now. */
  get storage(): StorageKind {
    return this.kind ?? "none";
  }

  get filePath(): string {
    return this.file;
  }

  private readKeyring(): Persisted | null {
    try {
      return parse(this.keyring?.get());
    } catch {
      return null; // the credential store is locked or unavailable
    }
  }

  private readFile(): Persisted | null {
    try {
      return parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return null;
    }
  }

  private removeFile(): void {
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      // nothing to remove
    }
  }

  async read(): Promise<Session | null> {
    if (this.memory) return this.memory;
    const fromKeyring = this.readKeyring();
    const persisted = fromKeyring ?? this.readFile();
    if (!persisted) {
      this.kind = null;
      return null;
    }
    this.kind = fromKeyring ? "keychain" : "file";
    // No access token is stored: an empty one makes the session manager renew it before first use.
    return { accessToken: "", refreshToken: persisted.refreshToken, expiresAt: 0, email: persisted.email };
  }

  async write(session: Session): Promise<void> {
    this.memory = session;
    const value = JSON.stringify({ refreshToken: session.refreshToken, email: session.email } satisfies Persisted);
    if (this.keyring) {
      try {
        this.keyring.set(value);
        this.kind = "keychain";
        this.removeFile(); // never leave an older copy behind in a file
        return;
      } catch {
        // fall through to the protected file
      }
    }
    // No credential store. The only other place is a file in the user's own configuration folder,
    // readable by that user alone — and never one inside the project. If that can't be had, the
    // session is not stored at all and signing in fails, rather than leaving it somewhere unsafe.
    if (this.projectDirectory && isInside(this.file, this.projectDirectory)) {
      this.memory = null;
      throw new SessionStorageError("PawOS couldn't store your session safely: no system credential store is available, and its own folder is inside this project. Sign-in was not completed.");
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file, value, { encoding: "utf8", mode: 0o600 });
      try {
        fs.chmodSync(this.file, 0o600); // an existing file keeps its old mode otherwise
      } catch {
        // not supported on this file system
      }
    } catch {
      this.memory = null;
      throw new SessionStorageError("PawOS couldn't store your session: no system credential store is available and its own folder can't be written. Sign-in was not completed.");
    }
    this.kind = "file";
  }

  async clear(): Promise<void> {
    this.memory = null;
    this.kind = null;
    try {
      this.keyring?.delete();
    } catch {
      // nothing stored, or the store is unavailable
    }
    this.removeFile();
  }
}
