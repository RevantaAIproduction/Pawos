import { browserLogin } from "../auth/browserLogin";
import type { CliContext } from "../context";
import { explainLocalRepository, type LocalRepository } from "../git/localRepository";
import { PawosApiError, SESSION_EXPIRED_NOTICE, describeRepository, newRequestId, type Capabilities, type RepositoryReadiness, type TaskOutcome } from "../shared";
import type { PendingTask } from "../state/pendingTask";
import { renderProgress } from "../ui/progress";
import { confirm } from "../ui/prompts";
import { LIMITATION_NOTE, renderOutcome } from "../ui/result";
import { LiveStatus } from "../ui/spinner";
import { blank, clean, indent, line, seg, type Line } from "../ui/terminal";

/** PawOS Web's own limit on a message (WEB_POLICY.maxMessageChars); the server enforces it too. */
export const MAX_TASK_CHARS = 4000;

export function banner(ctx: CliContext): Line[] {
  return [blank(), line("  ", seg(ctx.term.glyphs.mark, "accent"), " ", seg("PawOS", "strong"), seg(`  v${ctx.version}`, "muted")), line("  ", seg("AI Developer OS", "muted")), blank()];
}

const ok = (ctx: CliContext, text: string, detail?: string): Line => line("  ", seg(ctx.term.glyphs.done, "good"), " ", text, ...(detail ? [seg(`  ${detail}`, "muted")] : []));
const bad = (ctx: CliContext, text: string): Line => line("  ", seg(ctx.term.glyphs.failed, "bad"), " ", text);
const note = (text: string): Line => line("    ", seg(text, "muted"));

interface Account {
  capabilities: Capabilities;
  readiness: RepositoryReadiness;
  local: LocalRepository;
}

/** Loads the account and the repositories, with the PawOS mark turning while it does. */
async function connect(ctx: CliContext): Promise<Account | PawosApiError | Error> {
  const live = new LiveStatus(ctx.term, ctx.timers);
  live.start(`Connecting to PawOS${ctx.term.glyphs.ellipsis}`);
  try {
    const [capabilities, readiness, local] = await Promise.all([ctx.client.getCapabilities(), ctx.client.getRepositoryReadiness(), ctx.detectRepository()]);
    return { capabilities, readiness, local };
  } catch (error) {
    return error instanceof Error ? error : new Error("Something went wrong.");
  } finally {
    live.stop();
  }
}

/** Points PawOS at the local repository — the existing API, and only after the user said yes. */
async function useLocalRepository(ctx: CliContext, fullName: string): Promise<RepositoryReadiness | null> {
  try {
    return await ctx.client.selectRepository(fullName);
  } catch (error) {
    ctx.term.print([bad(ctx, "PawOS couldn't switch to this repository."), note(clean(error instanceof Error ? error.message : "Please try again."))]);
    return null;
  }
}

type Followed = TaskOutcome | "interrupted";

/**
 * Follows one task to its result with the live progress display. The task is sent at most once:
 * `resume` only ever asks PawOS about the request id it already has. If the user presses Ctrl+C the
 * display stops, the task keeps running on PawOS, and its request id is kept for next time.
 */
export async function followTask(ctx: CliContext, task: PendingTask, resume: boolean): Promise<Followed> {
  const { term } = ctx;
  const working = `PawOS is working${term.glyphs.ellipsis}`;
  const live = new LiveStatus(term, ctx.timers);
  term.print([blank()]);
  live.start(working, renderProgress(null, term.glyphs));

  let interrupt!: () => void;
  const interrupted = new Promise<"interrupted">((resolve) => (interrupt = () => resolve("interrupted")));
  const stopListening = ctx.onInterrupt(interrupt);
  let result: Followed;
  try {
    result = await Promise.race([
      ctx.run({
        client: ctx.client,
        requestId: task.requestId,
        content: task.content,
        resume,
        onUpdate: ({ phase, change }) => live.update(renderProgress(change, term.glyphs), phase === "pushed" ? `PawOS pushed the change and is watching your repository's checks${term.glyphs.ellipsis}` : working),
      }),
      interrupted,
    ]);
  } catch (error) {
    result = { status: "failed", message: error instanceof Error ? error.message : "Something went wrong running the task.", change: null };
  } finally {
    stopListening();
    live.stop(); // the animation never outlives the task
  }

  if (result === "interrupted") {
    term.print(indent([
      line(seg("Stopped watching.", "strong"), " The task was not cancelled: it continues on PawOS."),
      blank(),
      line(seg("Request ID", "muted")),
      line("  ", clean(task.requestId, 80)),
      blank(),
      line("Run ", seg("pawos", "strong"), " here again to see its result. It will not be sent twice."),
    ]));
    return result;
  }

  // Where progress was drawn in place it has been erased; where it was printed, leave a line after it.
  term.print([...(term.caps.interactive ? [] : [blank()]), ...indent(renderOutcome(result, task.requestId, term.glyphs)), blank()]);
  // Keep the request id whenever PawOS may still hold the task: a timeout, or a connection that never came back.
  const recoverable = result.status === "timeout" || (result.status === "failed" && result.error?.uncertain === true);
  if (!recoverable) ctx.pending.clear();
  return result;
}

/**
 * `pawos` — the interactive session: sign in if needed, show where PawOS will work, then take
 * tasks one after another until the user leaves.
 */
export async function interactive(ctx: CliContext): Promise<number> {
  const { term, session } = ctx;
  term.print(banner(ctx));
  if (!ctx.config.ok) {
    term.print([bad(ctx, ctx.config.problem)]);
    return 2;
  }

  await session.initialize();
  if (session.status !== "signedIn") {
    if (!(await browserLogin(ctx, { announce: false }))) return 1;
    term.print([blank()]);
  }

  let account = await connect(ctx);
  if (account instanceof PawosApiError && account.kind === "unauthenticated") {
    term.print([line("  ", seg(SESSION_EXPIRED_NOTICE, "warn"))]);
    if (!(await browserLogin(ctx, { announce: false }))) return 1;
    term.print([blank()]);
    account = await connect(ctx);
  }
  if (account instanceof Error) {
    term.print([bad(ctx, clean(account.message))]);
    return 1;
  }

  const plan = clean(account.capabilities.plan?.label, 60);
  term.print([ok(ctx, "Signed in", [session.email ? clean(session.email, 120) : null, plan].filter(Boolean).join(" · "))]);

  const local = account.local;
  if (local.kind !== "github") {
    const [what, how] = explainLocalRepository(local);
    term.print([bad(ctx, "No GitHub repository detected"), note(what!), note(how!)]);
    if (account.readiness.state === "ready") term.print([note(`PawOS is set to ${clean(account.readiness.repository.fullName, 200)}. It was not used: PawOS only runs from that project's folder.`)]);
    term.print([blank()]);
    return 1;
  }
  term.print([ok(ctx, "Repository detected", local.fullName)]);

  let repo = describeRepository(account.readiness, local.fullName);
  if (repo.kind === "locked" || repo.kind === "githubNotConnected" || repo.kind === "githubNeedsReauth") {
    term.print([bad(ctx, clean(repo.message)), blank()]);
    return 1;
  }
  if (repo.kind === "noRepository" || repo.mismatch) {
    const lines: Line[] = repo.mismatch
      ? [blank(), line("  Local repository:"), note(local.fullName), blank(), line("  PawOS repository:"), note(clean(repo.selected, 200)), blank(), line("  ", seg("These repositories do not match.", "warn")), blank()]
      : [blank(), line("  PawOS has no repository selected yet."), blank()];
    term.print(lines);
    // Never switched silently: only on an explicit yes, and it changes the selection on PawOS Web too.
    if (!(await confirm(ctx.prompter, "  Use the local repository in PawOS?"))) {
      term.print([blank(), line(seg("  Nothing was changed. PawOS only runs here once the repositories match.", "muted")), blank()]);
      return 0;
    }
    const readiness = await useLocalRepository(ctx, local.fullName);
    if (!readiness) return 1;
    repo = describeRepository(readiness, local.fullName);
    if (!repo.canRun || repo.mismatch) {
      term.print([bad(ctx, clean(repo.message) || "PawOS couldn't switch to this repository."), blank()]);
      return 1;
    }
  }
  const selected = repo.selected ?? local.fullName;
  term.print([ok(ctx, "GitHub project connected", repo.defaultBranch ? `${clean(selected, 200)} (${clean(repo.defaultBranch, 100)})` : clean(selected, 200)), blank(), line("  ", seg(LIMITATION_NOTE, "muted")), blank()]);

  // A task from an earlier run that never reported back: ask about it — never send it again.
  const earlier = ctx.pending.read();
  if (earlier) {
    term.print([line("  An earlier task hasn't reported its result:"), note(clean(earlier.content, 160)), blank()]);
    if (await confirm(ctx.prompter, "  Check on it?")) {
      if ((await followTask(ctx, earlier, true)) === "interrupted") return 130;
    } else {
      ctx.pending.clear();
      term.print([note(`Left alone. Its request ID was ${clean(earlier.requestId, 80)}.`), blank()]);
    }
  }

  for (;;) {
    term.print([line("  ", ...term.rule()), blank(), line("  ", seg("What would you like PawOS to do?", "strong")), blank()]);
    const answer = await ctx.prompter.ask(`  ${term.glyphs.prompt} `);
    if (answer === null) break;
    const content = answer.trim();
    if (!content) continue;
    if (/^(exit|quit|\/exit|\/quit)$/i.test(content)) break;
    if (content.length > MAX_TASK_CHARS) {
      term.print([line("  ", seg(`Keep the task under ${MAX_TASK_CHARS.toLocaleString("en-US")} characters.`, "warn")), blank()]);
      continue;
    }
    const task: PendingTask = { requestId: newRequestId(), content, repository: selected, startedAt: new Date().toISOString() };
    ctx.pending.write(task); // before it is sent, so an interruption at any point can be picked up again
    const result = await followTask(ctx, task, false);
    if (result === "interrupted") return 130;
    if (result.status === "failed" && result.error?.kind === "unauthenticated") {
      term.print([line("  ", seg("Run pawos login, then pawos, to continue.", "muted")), blank()]);
      return 1;
    }
  }
  term.print([blank()]);
  return 0;
}
