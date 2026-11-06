import * as fs from "fs";
import * as path from "path";
import { latestCheckpoint } from "./checkpoint";
import type { Workspace } from "./workspace";

/**
 * How big one task's change to the project really is: the files it changed and the lines added or
 * removed, measured from the task's own checkpoint (the copy of each file kept before PawOS first
 * changed it) against what is on disk now. Used as the evidence an Autonomous Work ticket is priced
 * by — measured here, never estimated or taken from the model.
 */
export interface ChangeSize {
  filesChanged: number;
  linesChanged: number;
}

/** Lines in one text and not the other, counted both ways (a changed line counts as one removed and one added). */
export function changedLines(before: string, after: string): number {
  const lines = (text: string) => (text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/));
  const counts = new Map<string, number>();
  for (const line of lines(before)) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of lines(after)) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added += 1;
  }
  let removed = 0;
  for (const left of counts.values()) removed += left;
  return added + removed;
}

function readText(file: string): string | null {
  try {
    const bytes = fs.readFileSync(file);
    return bytes.includes(0) ? null : bytes.toString("utf8");
  } catch {
    return null;
  }
}

/** The change size of the task with this id, or null when it left no checkpoint (it changed nothing, or kept no copy). */
export function measureTaskChange(stateDirectory: string | undefined, workspace: Workspace, taskId: string): ChangeSize | null {
  const found = latestCheckpoint(stateDirectory, workspace);
  if (!found || found.manifest.taskId !== taskId) return null;
  let filesChanged = 0;
  let linesChanged = 0;
  for (const entry of found.manifest.entries) {
    const target = path.join(workspace.root, ...entry.relative.split("/"));
    const before = entry.before.kind === "file" && entry.blob ? readText(path.join(found.directory, entry.blob)) : entry.before.kind === "absent" ? "" : null;
    const now = fs.existsSync(target) ? readText(target) : "";
    if (before === now) continue;
    filesChanged += 1;
    // A binary file (or one whose copy is missing) counts as a changed file with no countable lines.
    if (before !== null && now !== null) linesChanged += changedLines(before, now);
  }
  return { filesChanged, linesChanged };
}
