/**
 * FUTURE — PawOS Web Autonomous Work. NOTHING IN THIS FILE IS IMPLEMENTED.
 *
 * The contract a future remote-work runtime will implement, written down now so the Web side
 * doesn't need rewriting when it exists. The intended flow:
 *
 *   Web → create session → isolated remote workspace → PawOS coding runtime (terminal, browser,
 *   MCP, tests) → changes → commit / PR → review in Web → optionally continue in Desktop.
 *
 * Rules any implementation must keep:
 *  - It is gated by `web.remoteWork` / `web.autonomousWork` (webCapabilities.ts), both "future"
 *    today, so no route can start one.
 *  - Model and compute usage are charged through the existing reserve_usage / settle_usage
 *    buckets (and the existing Autonomous Task Credits, as on the desktop) — no Web balance.
 *  - Credentials stay server-side; the remote workspace receives scoped, short-lived access only.
 *  - Every session records surface = "web" so activity history shows where the work ran.
 *
 * Until then `remoteWorkProvider` is null, and the UI shows Autonomous Work as a desktop feature.
 */

export type RemoteWorkSessionState = "queued" | "provisioning" | "running" | "awaitingReview" | "completed" | "failed" | "cancelled";

export interface RemoteWorkSession {
  id: string;
  /** The web chat the session was started from, if any. */
  chatId: string | null;
  state: RemoteWorkSessionState;
  surface: "web";
  createdAt: string;
  /** A pull request the session opened, once it has one. */
  pullRequestUrl: string | null;
}

export interface RemoteWorkRequest {
  /** Client-generated id; creating twice with the same id returns the same session. */
  requestId: string;
  chatId: string | null;
  goal: string;
  /** A repository the account has connected (connectivity_connections), e.g. "github:owner/repo". */
  repository: string;
}

export interface RemoteWorkProvider {
  create(userId: string, request: RemoteWorkRequest): Promise<RemoteWorkSession>;
  get(userId: string, sessionId: string): Promise<RemoteWorkSession | null>;
  cancel(userId: string, sessionId: string): Promise<void>;
}

/** No remote-work runtime exists yet. */
export const remoteWorkProvider: RemoteWorkProvider | null = null;
