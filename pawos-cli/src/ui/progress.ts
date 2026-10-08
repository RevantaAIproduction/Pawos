import type { CodeChange, CodeChangeStep } from "../shared";
import { clean, line, seg, type Glyphs, type Line, type Tone } from "./terminal";

/**
 * A task's progress, drawn from the steps PawOS reports — its labels, its order, its statuses.
 * Nothing is added, renamed or guessed: if PawOS hasn't reported a step yet, none is shown.
 *
 * Only steps that have happened or are happening are listed. PawOS reports its whole plan up front
 * with every later step "pending", but a pending step is something that has not been done and may
 * never be — a request can end at the plan — so "Commit and push" or "Preview and checks" appears
 * only once PawOS says it has actually started it.
 */
const MARK: Record<CodeChangeStep["status"], keyof Glyphs> = { done: "done", active: "active", pending: "pending", failed: "failed", skipped: "skipped" };
const TONE: Record<CodeChangeStep["status"], Tone | undefined> = { done: "good", active: "accent", pending: "muted", failed: "bad", skipped: "muted" };

export function renderSteps(steps: CodeChangeStep[] | null | undefined, glyphs: Glyphs): Line[] {
  // A status this version doesn't know is treated as not started: it is never shown as done or running.
  const started = (steps ?? []).filter((step) => step.status === "done" || step.status === "active" || step.status === "failed" || step.status === "skipped");
  return started.map((step) => {
    const status = MARK[step.status] ? step.status : "pending";
    const quiet = status === "pending" || status === "skipped";
    const detail = clean(step.detail, 160);
    return line("  ", seg(glyphs[MARK[status]], TONE[status]), " ", seg(clean(step.label, 120) || clean(step.id, 40), quiet ? "muted" : status === "failed" ? "bad" : undefined), ...(detail ? [seg(`  ${detail}`, "muted")] : []));
  });
}

/**
 * The backend's step ids (pawos-web/src/lib/webCode/codeChange.ts StepId) in PawOS's own words.
 * Only ids whose meaning is known are here; anything else is never guessed at.
 *
 *   read     reading the repository's files          → exploring
 *   plan     choosing which files the change needs   → planning
 *   write    writing the change                      → building
 *   fix      rewriting it after a failed check       → building
 *   check    checking the change for problems        → verifying
 *   preview  watching the repository's own checks    → verifying
 *
 * "push" (committing) has no word of its own and shows the generic line.
 */
const STAGE_VERB: Record<string, string> = { read: "exploring", plan: "planning", write: "building", fix: "building", check: "verifying", preview: "verifying" };

/**
 * The status line for a task: "PawOS is planning…" when the backend reports a step in progress that
 * is known, and the plain "PawOS is working…" otherwise — no active step yet, more than one, or one
 * this version doesn't recognise. It describes only what the backend says is happening now.
 */
export function stageTitle(change: Pick<CodeChange, "steps"> | null, glyphs: Glyphs): string {
  const active = (change?.steps ?? []).filter((step) => step.status === "active");
  const id = active.length === 1 && typeof active[0]!.id === "string" ? active[0]!.id : "";
  return `PawOS is ${Object.hasOwn(STAGE_VERB, id) ? STAGE_VERB[id] : "working"}${glyphs.ellipsis}`;
}

/** What is shown under "PawOS is working…": the steps, or a quiet line until the first ones arrive. */
export function renderProgress(change: Pick<CodeChange, "steps"> | null, glyphs: Glyphs): Line[] {
  const steps = renderSteps(change?.steps, glyphs);
  return steps.length > 0 ? steps : [line("  ", seg(`Starting${glyphs.ellipsis}`, "muted"))];
}
