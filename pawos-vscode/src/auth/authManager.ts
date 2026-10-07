import { AuthRequiredError } from "../../../pawos-shared/src/auth/types";
import type { ConfigResult, PawosConfig } from "../config";
import { createPkcePair, type PkcePair } from "./pkce";
import type { SessionStore } from "./sessionStore";
import { AuthRejectedError, buildAuthorizeUrl, exchangeCode, refreshSession, revokeSession, type FetchLike, type Session, type SignInProvider } from "./supabaseAuth";

export type AuthStatus = "signedOut" | "signingIn" | "signedIn";

export { AuthRequiredError };

export const SESSION_EXPIRED_NOTICE = "Your PawOS session has expired. Sign in again.";
const REFRESH_BEFORE_EXPIRY_SECONDS = 60;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export interface AuthManagerDeps {
  store: SessionStore;
  getConfig: () => ConfigResult;
  /** Opens the system browser. */
  openExternal: (url: string) => Promise<boolean>;
  /** Where the browser returns to: this extension's own vscode:// address. */
  redirectUri: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  createPair?: () => PkcePair;
  signInTimeoutMs?: number;
}

/**
 * LEGACY — no longer wired into the extension. Sign-in now goes through PawOS's own browser
 * hand-off (pawos-shared/src/auth/session.ts), which needs no Supabase settings and works for
 * every kind of PawOS account. Kept, with its tests, until the direct flow is formally retired.
 *
 * Sign-in state for the extension. Signing in is PKCE in the system browser against the PawOS
 * Supabase project; the resulting session lives in SecretStorage and is refreshed here. Every API
 * call asks getAccessToken() for a current token — nothing else in the extension holds one.
 */
export class AuthManager {
  status: AuthStatus = "signedOut";
  email: string | null = null;
  /** Why the user was signed out, when it wasn't their choice. */
  notice: string | null = null;

  private readonly listeners = new Set<() => void>();
  private pending: { verifier: string; resolve: (code: string) => void; reject: (error: Error) => void } | null = null;
  private refreshing: Promise<Session> | null = null;

  constructor(private readonly deps: AuthManagerDeps) {}

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

  private config(): PawosConfig {
    const result = this.deps.getConfig();
    if (!result.ok) throw new Error(result.problem);
    return result.config;
  }

  /** Restores a session saved by an earlier window. */
  async initialize(): Promise<void> {
    const session = await this.deps.store.read();
    this.set(session ? "signedIn" : "signedOut", session?.email ?? null, null);
  }

  /** Opens the browser to sign in and resolves once the session is stored. */
  async signIn(provider: SignInProvider): Promise<void> {
    const config = this.config();
    this.pending?.reject(new Error("Sign-in was restarted."));
    const pair = (this.deps.createPair ?? createPkcePair)();
    const code = new Promise<string>((resolve, reject) => {
      this.pending = { verifier: pair.verifier, resolve, reject };
    });
    code.catch(() => undefined); // settled below; never an unhandled rejection
    this.set("signingIn", null, null);

    const timeout = setTimeout(() => this.pending?.reject(new Error("Sign-in wasn't completed in the browser. Try again.")), this.deps.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS);
    try {
      const opened = await this.deps.openExternal(buildAuthorizeUrl(config, provider, this.deps.redirectUri, pair.challenge));
      if (!opened) throw new Error("The browser couldn't be opened for sign-in.");
      const session = await exchangeCode(config, await code, pair.verifier, this.deps.fetchImpl, this.now());
      await this.deps.store.write(session);
      this.set("signedIn", session.email, null);
    } catch (error) {
      this.set("signedOut", null, null);
      throw error;
    } finally {
      clearTimeout(timeout);
      this.pending = null;
    }
  }

  /** The browser came back to vscode://…/auth-callback with ?code= or ?error=. */
  handleCallback(params: URLSearchParams): void {
    const pending = this.pending;
    if (!pending) return; // nothing was started here: an unsolicited link is ignored
    const code = params.get("code");
    if (code) pending.resolve(code);
    else pending.reject(new Error(params.get("error_description") || "Sign-in was cancelled."));
  }

  /**
   * A current access token. Refreshes shortly before expiry (or when `forceRefresh` says the server
   * refused the last one). Throws AuthRequiredError when there is no session to use.
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const session = await this.deps.store.read();
    if (!session) {
      if (this.status !== "signedOut") this.set("signedOut", null, this.notice);
      throw new AuthRequiredError("Sign in to PawOS to continue.");
    }
    const expiringSoon = session.expiresAt - this.now() / 1000 <= REFRESH_BEFORE_EXPIRY_SECONDS;
    if (!forceRefresh && !expiringSoon) return session.accessToken;

    try {
      this.refreshing ??= refreshSession(this.config(), session.refreshToken, this.deps.fetchImpl, this.now()).finally(() => {
        this.refreshing = null;
      });
      const refreshed = await this.refreshing;
      await this.deps.store.write(refreshed);
      if (this.status !== "signedIn" || this.email !== refreshed.email) this.set("signedIn", refreshed.email, null);
      return refreshed.accessToken;
    } catch (error) {
      if (error instanceof AuthRejectedError) {
        await this.expire();
        throw new AuthRequiredError(SESSION_EXPIRED_NOTICE);
      }
      // Supabase unreachable: a token that is still valid can keep being used.
      if (!forceRefresh && session.expiresAt > this.now() / 1000) return session.accessToken;
      throw error;
    }
  }

  /** The server no longer accepts this session: forget it and say why. */
  async expire(): Promise<void> {
    await this.deps.store.clear();
    this.set("signedOut", null, SESSION_EXPIRED_NOTICE);
  }

  async signOut(): Promise<void> {
    const session = await this.deps.store.read();
    await this.deps.store.clear();
    this.set("signedOut", null, null);
    const config = this.deps.getConfig();
    if (session && config.ok) await revokeSession(config.config, session.accessToken, this.deps.fetchImpl);
  }
}
