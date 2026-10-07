import { beginDeviceLogin, endSession, exchangeLoginCode, refreshSession, type DeviceClient } from "./deviceLogin";
import { AuthRejectedError, AuthRequiredError, type FetchLike, type Session } from "./types";

export * from "./types";

/**
 * The signed-in session of a PawOS client (the CLI, the VS Code extension), and the one place that
 * hands out access tokens. Each client supplies where the session is kept (the operating system's
 * credential store, VS Code SecretStorage); everything else is the same for all of them.
 *
 * A client knows one address — PawOS's. It never talks to the identity provider, never sees a
 * password or a provider token, and holds no key of any kind.
 */
/** Where a client keeps its session. */
export interface SessionStorage {
  read(): Promise<Session | null>;
  write(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export type AuthStatus = "signedOut" | "signingIn" | "signedIn";

export const SESSION_EXPIRED_NOTICE = "Your PawOS session has expired. Sign in again.";
const REFRESH_BEFORE_EXPIRY_SECONDS = 60;

export interface SessionManagerDeps {
  storage: SessionStorage;
  /** PawOS's address. Throws when it isn't configured. */
  getApiBaseUrl: () => string;
  fetchImpl?: FetchLike;
  now?: () => number;
}

/** One sign-in in progress: open `url` in the browser, then `complete` with the code the user pastes. */
export interface PendingSignIn {
  url: string;
  complete(code: string): Promise<void>;
  cancel(): void;
}

export class SessionManager {
  status: AuthStatus = "signedOut";
  email: string | null = null;
  /** Why the user was signed out, when it wasn't their choice. */
  notice: string | null = null;

  private readonly listeners = new Set<() => void>();
  private refreshing: Promise<Session> | null = null;
  private signInAttempt = 0;

  constructor(private readonly deps: SessionManagerDeps) {}

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(status: AuthStatus, email: string | null, notice: string | null): void {
    this.status = status;
    this.email = email;
    this.notice = notice;
    for (const listener of this.listeners) listener();
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  /** Restores a session saved earlier. */
  async initialize(): Promise<void> {
    const session = await this.deps.storage.read();
    this.set(session ? "signedIn" : "signedOut", session?.email ?? null, null);
  }

  /**
   * Starts a browser sign-in. The returned address carries only a challenge; the secret it was made
   * from stays here, and the pasted code is useless to anyone without it.
   */
  beginSignIn(client: DeviceClient): PendingSignIn {
    const attempt = ++this.signInAttempt;
    const login = beginDeviceLogin(this.deps.getApiBaseUrl(), client);
    const before = { status: this.status, email: this.email };
    this.set("signingIn", null, null);
    return {
      url: login.url,
      complete: async (code) => {
        if (attempt !== this.signInAttempt) throw new AuthRejectedError("Sign-in was restarted. Use the newest code.");
        try {
          const session = await exchangeLoginCode(this.deps.getApiBaseUrl(), code, login.verifier, this.deps.fetchImpl);
          await this.deps.storage.write(session);
          this.set("signedIn", session.email, null);
        } catch (error) {
          this.set("signedOut", null, null);
          throw error;
        }
      },
      cancel: () => {
        if (attempt !== this.signInAttempt || this.status !== "signingIn") return;
        this.set(before.status === "signedIn" ? "signedIn" : "signedOut", before.status === "signedIn" ? before.email : null, null);
      },
    };
  }

  /**
   * A current access token. Renews it shortly before it expires (or when `forceRefresh` says PawOS
   * refused the last one). Throws AuthRequiredError when there is no session to use.
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const session = await this.deps.storage.read();
    if (!session) {
      if (this.status === "signedIn") this.set("signedOut", null, this.notice);
      throw new AuthRequiredError("Sign in to PawOS to continue.");
    }
    const expiringSoon = !session.accessToken || session.expiresAt - this.now() / 1000 <= REFRESH_BEFORE_EXPIRY_SECONDS;
    if (!forceRefresh && !expiringSoon) return session.accessToken;

    try {
      this.refreshing ??= refreshSession(this.deps.getApiBaseUrl(), session.refreshToken, this.deps.fetchImpl).finally(() => {
        this.refreshing = null;
      });
      const refreshed = await this.refreshing;
      await this.deps.storage.write(refreshed);
      if (this.status !== "signedIn" || this.email !== refreshed.email) this.set("signedIn", refreshed.email, null);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof AuthRejectedError) {
        await this.expire();
        throw new AuthRequiredError(SESSION_EXPIRED_NOTICE);
      }
      // PawOS unreachable: a token that is still valid can keep being used.
      if (!forceRefresh && session.accessToken && session.expiresAt > this.now() / 1000) return session.accessToken;
      throw error;
    }
  }

  /** PawOS no longer accepts this session: forget it and say why. */
  async expire(): Promise<void> {
    await this.deps.storage.clear();
    this.set("signedOut", null, SESSION_EXPIRED_NOTICE);
  }

  async signOut(): Promise<void> {
    const session = await this.deps.storage.read();
    await this.deps.storage.clear();
    this.set("signedOut", null, null);
    if (!session) return;
    try {
      // End it on the server with a token PawOS will still accept; a failure changes nothing locally.
      const current = session.accessToken && session.expiresAt > this.now() / 1000 ? session.accessToken : (await refreshSession(this.deps.getApiBaseUrl(), session.refreshToken, this.deps.fetchImpl)).accessToken;
      await endSession(this.deps.getApiBaseUrl(), current, this.deps.fetchImpl);
    } catch {
      // Signed out here either way.
    }
  }
}
