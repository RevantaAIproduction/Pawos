import { PawosApiError, type SendOutcome } from "../api/pawosClient";
import type { CodeChange, SendResult } from "../api/types";

/**
 * Runs one task through PawOS Web's existing Code mode and reports its progress.
 *
 *   send   POST /api/web-chat/messages { content, requestId, mode: "codeChange" } — one long
 *          request during which PawOS reads the repository, writes the change and pushes it;
 *   watch  GET /api/web/changes/<requestId> every few seconds, for the live steps and, after the
 *          push, the repository's own checks (asking is also what lets PawOS check them).
 *
 * Nothing is executed here. A dropped connection never runs the change twice: the same request id
 * is only ever asked about again (recoverOnly), and PawOS answers with what it already has.
 */
export interface TaskClient {
  sendCodeChange(content: string, requestId: string): Promise<SendOutcome>;
  recoverSend(requestId: string): Promise<SendOutcome>;
  getChange(requestId: string): Promise<CodeChange | null>;
}

export interface TaskUpdate {
  /** "working": the change is being made. "pushed": it is on GitHub and its checks are being watched. */
  phase: "working" | "pushed";
  change: CodeChange | null;
}

export type TaskOutcome =
  | { status: "complete"; change: CodeChange; reply: string; checksPending: boolean }
  | { status: "noChange"; message: string }
  | { status: "failed"; message: string; change: CodeChange | null; error?: PawosApiError }
  | { status: "timeout"; change: CodeChange | null };

export interface TaskOptions {
  client: TaskClient;
  requestId: string;
  content: string;
  /** Only ask about an earlier send with this request id (after a timeout); never start a new one. */
  resume?: boolean;
  onUpdate?: (update: TaskUpdate) => void;
  pollMs?: number;
  /** How long to wait for PawOS to finish making the change. */
  workTimeoutMs?: number;
  /** How long to keep watching the repository's checks after the push. */
  checksWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const POLL_MS = 2_500;
const WORK_TIMEOUT_MS = 6 * 60 * 1000;
const CHECKS_WAIT_MS = 7 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;

type Settled = { ok: true; outcome: SendOutcome } | { ok: false; error: unknown };

export async function runTask(options: TaskOptions): Promise<TaskOutcome> {
  const { client, requestId, content } = options;
  const pollMs = options.pollMs ?? POLL_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const update = options.onUpdate ?? (() => undefined);

  const send: { settled: Settled | null } = { settled: null };
  const start = (request: Promise<SendOutcome>) => {
    send.settled = null;
    request.then(
      (outcome) => (send.settled = { ok: true, outcome }),
      (error: unknown) => (send.settled = { ok: false, error })
    );
  };
  /** The latest progress; a failed poll is not the task failing — except a session that has ended. */
  const poll = async (): Promise<CodeChange | null | PawosApiError> => {
    try {
      return await client.getChange(requestId);
    } catch (error) {
      return error instanceof PawosApiError && error.kind === "unauthenticated" ? error : null;
    }
  };

  let change: CodeChange | null = null;
  let delivered: SendResult | null = null;
  let recoveries = 0;
  const deadline = now() + (options.workTimeoutMs ?? WORK_TIMEOUT_MS);
  start(options.resume ? client.recoverSend(requestId) : client.sendCodeChange(content, requestId));

  // 1. Until PawOS answers the send: show the steps as they happen.
  while (!delivered) {
    let askAgain = false;
    const settled = send.settled;
    if (settled?.ok) {
      if (settled.outcome.kind === "delivered") {
        delivered = settled.outcome.result;
        break;
      }
      if (settled.outcome.kind === "notReceived") {
        return { status: "failed", message: "PawOS didn't receive the task, so nothing was changed. Run it again.", change };
      }
      askAgain = true; // still being worked on
    } else if (settled) {
      const error = settled.error;
      if (error instanceof PawosApiError && error.uncertain && recoveries < MAX_RECOVERY_ATTEMPTS) {
        recoveries += 1;
        askAgain = true; // the connection dropped: PawOS may well have the task
      } else {
        const message = error instanceof PawosApiError ? error.message : "Something went wrong running the task. Please try again.";
        return { status: "failed", message, change, ...(error instanceof PawosApiError ? { error } : {}) };
      }
    }
    if (now() >= deadline) return { status: "timeout", change };

    const latest = await poll();
    if (latest instanceof PawosApiError) return { status: "failed", message: latest.message, change, error: latest };
    if (latest) change = latest;
    update({ phase: "working", change });
    await sleep(pollMs);
    if (askAgain && send.settled === settled) start(client.recoverSend(requestId));
  }

  // 2. PawOS answered. Without a pushed commit there is nothing to review: say what it said.
  const answered = delivered.change ?? change;
  if (!answered?.commitSha) {
    if (answered?.state === "failed") return { status: "failed", message: delivered.reply, change: answered };
    return { status: "noChange", message: delivered.reply };
  }
  change = answered;
  update({ phase: "pushed", change });

  // 3. The change is on GitHub. Watch the repository's own checks until they settle.
  const checksDeadline = now() + (options.checksWaitMs ?? CHECKS_WAIT_MS);
  while (change.state !== "done" && change.state !== "failed" && now() < checksDeadline) {
    await sleep(pollMs);
    const latest = await poll();
    if (latest instanceof PawosApiError) break;
    if (latest) {
      change = latest;
      update({ phase: "pushed", change });
    }
  }
  return { status: "complete", change, reply: delivered.reply, checksPending: change.state !== "done" && change.state !== "failed" };
}
