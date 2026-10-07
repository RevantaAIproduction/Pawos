import { describeChecks, type CodeChange, type TaskOutcome } from "../shared";
import { renderSteps } from "./progress";
import { blank, clean, cleanLines, cleanUrl, line, seg, type Glyphs, type Line } from "./terminal";

/** How a finished task is shown. Only what PawOS returned: nothing here is inferred or embellished. */
export const LIMITATION_NOTE = "PawOS works on your connected GitHub project. Review the resulting commit or pull request.";

const heading = (text: string): Line => line(seg(text, "muted"));
const indented = (text: string, tone?: Parameters<typeof seg>[1]): Line => line("  ", seg(text, tone));

function linkLine(url: string | null, label?: string): Line | null {
  const safe = cleanUrl(url);
  if (!safe) return null;
  return line("  ", seg(label ?? safe, "accent", safe), ...(label ? [seg(`  ${safe}`, "muted")] : []));
}

function details(change: CodeChange, glyphs: Glyphs, checksPending: boolean): Line[] {
  const lines: Line[] = [];
  const summary = cleanLines(change.summary);
  if (summary.length > 0) lines.push(blank(), heading("Summary"), ...summary.map((text) => indented(text)));
  const files = (Array.isArray(change.files) ? change.files : []).map((file) => clean(file, 200)).filter(Boolean);
  if (files.length > 0) lines.push(blank(), heading("Files changed"), ...files.slice(0, 50).map((file) => indented(file)), ...(files.length > 50 ? [indented(`${glyphs.ellipsis} and ${files.length - 50} more`, "muted")] : []));
  if (change.commitSha) {
    // PawOS reports one overall result for the repository's checks, not a list of them.
    const mark = change.checksState === "success" ? seg(`${glyphs.done} `, "good") : change.checksState === "failure" ? seg(`${glyphs.failed} `, "bad") : seg("");
    lines.push(blank(), heading("Checks"), line("  ", mark, seg(describeChecks(change, checksPending), change.checksState === "failure" ? "bad" : undefined)));
    const sha = clean(change.commitSha, 64).replace(/[^0-9a-f]/gi, "").slice(0, 7);
    const branch = clean(change.branch, 120);
    const commit = cleanUrl(change.commitUrl);
    lines.push(blank(), heading("Commit"), line("  ", seg(sha || "unknown", "accent", commit ?? undefined), ...(branch ? [seg(`  on ${branch}`, "muted")] : [])));
    if (commit) lines.push(indented(commit, "muted"));
  }
  const pull = linkLine(change.pullRequestUrl);
  if (pull) lines.push(blank(), heading("Pull Request"), pull);
  const preview = linkLine(change.previewUrl);
  if (preview) lines.push(blank(), heading("Preview"), preview);
  return lines;
}

export function renderOutcome(outcome: TaskOutcome, requestId: string, glyphs: Glyphs): Line[] {
  const id = clean(requestId, 80);
  switch (outcome.status) {
    case "complete":
      return [line(seg(glyphs.done, "good"), " ", seg("Task completed", "strong")), ...details(outcome.change, glyphs, outcome.checksPending), blank(), line(seg(LIMITATION_NOTE, "muted"))];
    case "noChange":
      return [line(seg(glyphs.skipped, "muted"), " ", seg("No change was made", "strong")), blank(), ...cleanLines(outcome.message).map((text) => indented(text))];
    case "timeout":
      return [
        line(seg(glyphs.active, "warn"), " ", seg("PawOS is still working on this task", "strong")),
        blank(),
        ...renderSteps(outcome.change?.steps, glyphs),
        ...(outcome.change?.steps?.length ? [blank()] : []),
        heading("Request ID"),
        indented(id),
        blank(),
        line("It was not sent again. Run ", seg("pawos", "strong"), " to check on it."),
      ];
    case "failed": {
      const reason = cleanLines(outcome.message);
      const steps = renderSteps(outcome.change?.steps, glyphs);
      const partial = outcome.change?.commitSha ? details(outcome.change, glyphs, false) : [];
      return [
        line(seg(glyphs.failed, "bad"), " ", seg("PawOS could not complete the task", "strong")),
        blank(),
        heading("Reason"),
        ...(reason.length > 0 ? reason : ["No reason was given."]).map((text) => indented(text)),
        ...(steps.length > 0 ? [blank(), heading("Steps"), ...steps] : []),
        ...partial,
        blank(),
        heading("Request ID"),
        indented(id),
        blank(),
        line(seg("You can run PawOS again to continue investigating.", "muted")),
      ];
    }
  }
}
