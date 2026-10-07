import type { CodeChange, CodeChangeStep } from "../shared";
import { clean, line, seg, type Glyphs, type Line, type Tone } from "./terminal";

/**
 * A task's progress, drawn from the steps PawOS reports — its labels, its order, its statuses.
 * Nothing is added, renamed or guessed: if PawOS hasn't reported a step yet, none is shown.
 */
const MARK: Record<CodeChangeStep["status"], keyof Glyphs> = { done: "done", active: "active", pending: "pending", failed: "failed", skipped: "skipped" };
const TONE: Record<CodeChangeStep["status"], Tone | undefined> = { done: "good", active: "accent", pending: "muted", failed: "bad", skipped: "muted" };

export function renderSteps(steps: CodeChangeStep[] | null | undefined, glyphs: Glyphs): Line[] {
  return (steps ?? []).map((step) => {
    const status = MARK[step.status] ? step.status : "pending";
    const quiet = status === "pending" || status === "skipped";
    const detail = clean(step.detail, 160);
    return line("  ", seg(glyphs[MARK[status]], TONE[status]), " ", seg(clean(step.label, 120) || clean(step.id, 40), quiet ? "muted" : status === "failed" ? "bad" : undefined), ...(detail ? [seg(`  ${detail}`, "muted")] : []));
  });
}

/** What is shown under "PawOS is working…": the steps, or a quiet line until the first ones arrive. */
export function renderProgress(change: Pick<CodeChange, "steps"> | null, glyphs: Glyphs): Line[] {
  const steps = renderSteps(change?.steps, glyphs);
  return steps.length > 0 ? steps : [line("  ", seg(`Starting${glyphs.ellipsis}`, "muted"))];
}
