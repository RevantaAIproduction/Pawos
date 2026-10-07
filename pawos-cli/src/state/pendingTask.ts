import * as fs from "fs";
import * as path from "path";
import { REQUEST_ID_PATTERN } from "../shared";

/**
 * The one task this CLI sent whose result it hasn't seen — kept so that an interrupted or timed-out
 * task is asked about again, with the same request id, instead of ever being sent a second time.
 * It holds the task's text and its request id: no token, nothing secret.
 */
export interface PendingTask {
  requestId: string;
  content: string;
  repository: string;
  startedAt: string;
}

export const PENDING_FILE_NAME = "pending-task.json";

export class PendingTaskStore {
  private readonly file: string;

  constructor(directory: string) {
    this.file = path.join(directory, PENDING_FILE_NAME);
  }

  read(): PendingTask | null {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<PendingTask> | null;
      if (!value || typeof value.requestId !== "string" || !REQUEST_ID_PATTERN.test(value.requestId) || typeof value.content !== "string") return null;
      return { requestId: value.requestId, content: value.content, repository: typeof value.repository === "string" ? value.repository : "", startedAt: typeof value.startedAt === "string" ? value.startedAt : "" };
    } catch {
      return null;
    }
  }

  write(task: PendingTask): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(this.file, JSON.stringify(task), { encoding: "utf8", mode: 0o600 });
    } catch {
      // Without it the task still runs; it just can't be picked up again after an interruption.
    }
  }

  clear(): void {
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      // nothing to remove
    }
  }
}
