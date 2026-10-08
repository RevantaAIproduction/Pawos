import { browserLogin } from "../auth/browserLogin";
import type { CliContext } from "../context";
import { explainLocalRepository, type ProjectContext } from "../git/localRepository";
import { PawosApiError, SESSION_EXPIRED_NOTICE, describeRepository, newRequestId, sendChatMessage, type Capabilities, type RepositoryReadiness, type SendResult, type TaskOutcome } from "../shared";
import type { PendingTask } from "../state/pendingTask";
import { isPlanRefusal, renderRefusal } from "../ui/account";
import { StartupIntro, greeting, wordmarkLine } from "../ui/intro";
import { renderProgress, stageTitle } from "../ui/progress";
import { confirm } from "../ui/prompts";
import { renderOutcome } from "../ui/result";
import { LiveStatus } from "../ui/spinner";
import { blank, clean, cleanLines, indent, line, seg, type Line } from "../ui/terminal";
import { connectService, showConnections } from "./connections";
import { accountRows } from "./status";

/** PawOS Web's own limit on a message (WEB_POLICY.maxMessageChars); the server enforces it too. */
export const MAX_TASK_CHARS = 4000;
export const QUESTION = "What would you like to work on?";

/**
 * The top of the PawOS workspace: PawOS and its version, a greeting, then where the user is. The
 * greeting uses the first name PawOS returned for the account, and nothing else about it; without
 * one it is "Welcome back." The folder is always shown. The branch and the repository are shown only when Git actually reports them — a
 * folder that isn't a repository has no "Git:" line, a detached HEAD has none either, and a
 * repository with no GitHub remote has no "Repository:" line. Nothing is filled in by default.
 */
export function workspaceHeader(ctx: CliContext, project: ProjectContext, name: unknown = null): Line[] {
  const lines: Line[] = [
    wordmarkLine(ctx.version),
    line("  ", seg("AI Developer Workspace", "muted")),
    blank(),
    line("  ", greeting(name, ctx.now?.() ?? new Date())),
    blank(),
    line("  ", clean(project.cwd, 400)),
  ];
  if (project.branch) lines.push(line("  ", seg("Git: ", "muted"), clean(project.branch, 200)));
  if (project.repository.kind === "github") lines.push(line("  ", seg("Repository: ", "muted"), clean(project.repository.fullName, 200)));
  lines.push(blank());
  return lines;
}

const bad = (ctx: CliContext, text: string): Line => line("  ", seg(ctx.term.glyphs.failed, "bad"), " ", text);
const note = (text: string): Line => line("    ", seg(text, "muted"));
const baseUrl = (ctx: CliContext) => (ctx.config.ok ? ctx.config.config.apiBaseUrl : "");

interface Account {
  capabilities: Capabilities;
  readiness: RepositoryReadiness;
}

/**
 * Loads the account and the repository PawOS is set to. At startup the wordmark is already
 * animating, so nothing else is shown; otherwise the PawOS mark turns while it loads.
 */
async function connect(ctx: CliContext, quiet = false): Promise<Account | Error> {
  const live = new LiveStatus(ctx.term, ctx.timers);
  if (!quiet) live.start(`Connecting to PawOS${ctx.term.glyphs.ellipsis}`);
  try {
    const [capabilities, readiness] = await Promise.all([ctx.client.getCapabilities(), ctx.client.getRepositoryReadiness()]);
    return { capabilities, readiness };
  } catch (error) {
    return error instanceof Error ? error : new Error("Something went wrong.");
  } finally {
    if (!quiet) live.stop(); // when quiet, the line on screen belongs to the startup animation
  }
}

type Followed = TaskOutcome | "interrupted";

/**
 * Follows one code task to its result with the live status display. The task is sent at most once:
 * `resume` only ever asks PawOS about the request id it already has. If the user presses Ctrl+C the
 * display stops, the task keeps running on PawOS, and its request id is kept for next time.
 *
 * The status line and the steps under it are the backend's own report (see ui/progress.ts): the
 * line names the step PawOS says is in progress, and a step is marked done only when PawOS says so.
 */
export async function followTask(ctx: CliContext, task: PendingTask, resume: boolean, planLabel: string | null = null): Promise<Followed> {
  const { term } = ctx;
  const live = new LiveStatus(term, ctx.timers);
  term.print([blank()]);
  live.start(stageTitle(null, term.glyphs), renderProgress(null, term.glyphs));

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
        onUpdate: ({ change }) => live.update(renderProgress(change, term.glyphs), stageTitle(change, term.glyphs)),
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
    term.print(
      indent([
        line(seg("Stopped watching.", "strong"), " The task was not cancelled: it continues on PawOS."),
        blank(),
        line(seg("Request ID", "muted")),
        line("  ", clean(task.requestId, 80)),
        blank(),
        line("Run ", seg("pawos", "strong"), " here again to see its result. It will not be sent twice."),
        blank(),
      ])
    );
    return result;
  }

  // Where progress was drawn in place it has been erased; where it was printed, leave a line after it.
  term.print([...(term.caps.interactive ? [] : [blank()]), ...indent(renderOutcome(result, task.requestId, term.glyphs)), blank()]);
  // PawOS refused it because of the plan, usage or credits: say where the options are. The refusal stands.
  if (result.status === "failed" && isPlanRefusal(result.error)) term.print([...renderRefusal(result.error, planLabel, baseUrl(ctx)).slice(-5), blank()]);
  // Keep the request id whenever PawOS may still hold the task: a timeout, or a connection that never came back.
  const recoverable = result.status === "timeout" || (result.status === "failed" && result.error?.uncertain === true);
  if (!recoverable) ctx.pending.clear();
  return result;
}

type Asked = { kind: "reply"; result: SendResult } | { kind: "refused"; error: unknown } | { kind: "interrupted" };

/**
 * One message to Paw through the existing PawOS chat — the same conversation, plan and usage rules
 * as PawOS Web, from whatever folder the user is in. The message is sent once; PawOS decides
 * whether the account may send it and what it costs.
 */
async function ask(ctx: CliContext, content: string, chatId: string | null): Promise<Asked> {
  const { term } = ctx;
  const live = new LiveStatus(term, ctx.timers);
  term.print([blank()]);
  live.start(`PawOS is thinking${term.glyphs.ellipsis}`);
  let interrupt!: () => void;
  const interrupted = new Promise<Asked>((resolve) => (interrupt = () => resolve({ kind: "interrupted" })));
  const stopListening = ctx.onInterrupt(interrupt);
  try {
    return await Promise.race([
      (ctx.chat ?? sendChatMessage)({ client: ctx.client, content, requestId: newRequestId(), chatId }).then(
        (result): Asked => ({ kind: "reply", result }),
        (error: unknown): Asked => ({ kind: "refused", error })
      ),
      interrupted,
    ]);
  } finally {
    stopListening();
    live.stop();
  }
}

/** What Code mode can do here, decided by what PawOS and Git report — and why not, when it can't. */
type CodeMode = { repository: string } | { unavailable: string[] };

/**
 * Works out whether this folder can take code changes: it must be a GitHub repository, GitHub must
 * be connected to the account, and PawOS must be set to that repository. Each of those is asked or
 * read, never assumed, and the repository PawOS works on is only ever changed on an explicit yes.
 * None of it is needed to use PawOS: without it the workspace simply has no Code mode.
 */
async function resolveCodeMode(ctx: CliContext, project: ProjectContext, account: Account): Promise<CodeMode> {
  const { term } = ctx;
  const local = project.repository;
  if (local.kind !== "github") return { unavailable: explainLocalRepository(local) };

  let readiness = account.readiness;
  let repo = describeRepository(readiness, local.fullName);
  if (repo.kind === "githubNotConnected" || repo.kind === "githubNeedsReauth") {
    term.print([line("  ", seg(clean(repo.message), "warn")), blank()]);
    if (await confirm(ctx.prompter, "  Connect GitHub now?")) {
      if (await connectService(ctx, "github", account.capabilities.plan?.label ?? null)) {
        readiness = await ctx.client.getRepositoryReadiness().catch(() => readiness);
        repo = describeRepository(readiness, local.fullName);
      }
    } else term.print([blank()]);
  }
  if (repo.kind === "locked" || repo.kind === "githubNotConnected" || repo.kind === "githubNeedsReauth") return { unavailable: [clean(repo.message) || "Code changes aren't available for this account."] };

  if (repo.kind === "noRepository" || repo.mismatch) {
    const lines: Line[] = repo.mismatch
      ? [line("  Local repository:"), note(local.fullName), blank(), line("  PawOS repository:"), note(clean(repo.selected, 200)), blank(), line("  ", seg("These repositories do not match.", "warn")), blank()]
      : [line("  PawOS has no repository selected yet."), blank()];
    term.print(lines);
    // Never switched silently: only on an explicit yes, and it changes the selection on PawOS Web too.
    if (!(await confirm(ctx.prompter, "  Use the local repository in PawOS?"))) {
      term.print([blank(), line(seg("  Nothing was changed. Code changes stay off here until the repositories match.", "muted")), blank()]);
      return { unavailable: ["PawOS isn't set to this repository.", "Run /code again to choose it."] };
    }
    try {
      readiness = await ctx.client.selectRepository(local.fullName);
    } catch (error) {
      term.print([bad(ctx, "PawOS couldn't switch to this repository."), note(clean(error instanceof Error ? error.message : "Please try again.")), blank()]);
      return { unavailable: ["PawOS couldn't switch to this repository."] };
    }
    repo = describeRepository(readiness, local.fullName);
    term.print([blank()]);
    if (!repo.canRun || repo.mismatch) return { unavailable: [clean(repo.message) || "PawOS couldn't switch to this repository."] };
  }
  return { repository: repo.selected ?? local.fullName };
}

export const COMMAND_HELP: [string, string][] = [
  ["/code", "Make changes in this project's GitHub repository"],
  ["/chat", "Talk to PawOS without changing anything"],
  ["/connections", "Show your connected services"],
  ["/connect <name>", "Connect a service to your PawOS account"],
  ["/status", "Show your account, plan and usage"],
  ["/help", "Show these commands"],
  ["/exit", "Leave PawOS"],
];

/**
 * The PawOS workspace — what `pawos` opens from any folder, and what `pawos login` opens once it
 * has signed in. One session from start to finish: sign in if needed, show where the user is, then
 * take what they type, one thing after another, returning to the prompt each time.
 *
 * The account (the plan, usage, connections) is the same wherever PawOS is started. The folder only
 * adds context: inside a GitHub repository PawOS can also make code changes there.
 */
export async function interactive(ctx: CliContext, options: { signIn?: boolean } = {}): Promise<number> {
  const { term, session } = ctx;
  if (!ctx.config.ok) {
    term.print([blank(), bad(ctx, ctx.config.problem)]);
    return 2;
  }

  await session.initialize();
  // Signed out (or asked to sign in): authenticate first, then carry straight on into the workspace.
  if ((options.signIn || session.status !== "signedIn") && !(await browserLogin(ctx))) return 1;

  const project = await ctx.detectProject();
  // PawOS comes online: the wordmark animates, once, while the account loads. The two run together,
  // so the animation costs no extra time unless PawOS answers faster than it plays.
  term.print([blank()]);
  const intro = new StartupIntro(term, ctx.version, ctx.timers, ctx.animateStartup !== false);
  intro.start();
  let account: Account | Error;
  try {
    account = await connect(ctx, true);
    await intro.finished;
  } finally {
    intro.stop(); // its line is handed back whatever happened; the header takes its place
  }
  if (account instanceof PawosApiError && account.kind === "unauthenticated") {
    // The stored session is no longer accepted: it has been cleared. Sign in again, once.
    term.print([line("  ", seg(SESSION_EXPIRED_NOTICE, "warn"))]);
    if (!(await browserLogin(ctx))) return 1;
    term.print([blank()]);
    account = await connect(ctx);
  }
  term.print(workspaceHeader(ctx, project, account instanceof Error ? null : account.capabilities.user?.name));
  if (account instanceof Error) {
    term.print([bad(ctx, clean(account.message)), blank()]);
    return 1;
  }
  const planLabel = account.capabilities.plan?.label ?? null;

  // Code mode is extra, for a GitHub project. PawOS itself starts everywhere.
  let code = await resolveCodeMode(ctx, project, account);
  let mode: "code" | "chat" = "repository" in code ? "code" : "chat";
  let chatId: string | null = null;

  // A code task from an earlier run that never reported back: ask about it — never send it again.
  const earlier = ctx.pending.read();
  if (earlier) {
    term.print([line("  An earlier task hasn't reported its result:"), note(clean(earlier.content, 160)), blank()]);
    if (await confirm(ctx.prompter, "  Check on it?")) {
      if ((await followTask(ctx, earlier, true, planLabel)) === "interrupted") return 130;
    } else {
      ctx.pending.clear();
      term.print([note(`Left alone. Its request ID was ${clean(earlier.requestId, 80)}.`), blank()]);
    }
  }

  let cancelledOnce = false;
  for (;;) {
    const hint: Line[] =
      mode === "code" && "repository" in code
        ? [line("  ", seg(`Code mode: changes go to ${clean(code.repository, 200)} on GitHub. /chat to just talk.`, "muted")), blank()]
        : "repository" in code
          ? [line("  ", seg(`Chat. /code to make changes in ${clean(code.repository, 200)}.`, "muted")), blank()]
          : [];
    term.print([line("  ", ...term.rule()), blank(), line("  ", seg(QUESTION, "strong")), blank(), ...hint]);
    const answer = await ctx.prompter.ask(`  ${term.glyphs.prompt} `);
    if (answer === null) {
      // Ctrl+C at the prompt cancels what was being typed and submits nothing. A second one leaves.
      if (ctx.prompter.interrupted && !cancelledOnce) {
        cancelledOnce = true;
        term.print([line("  ", seg("Cancelled. Press Ctrl+C again to leave PawOS.", "muted")), blank()]);
        continue;
      }
      break;
    }
    cancelledOnce = false;
    const content = answer.trim();
    if (!content) continue;

    // The workspace's own commands. Anything else starting with "/" is a mistake, never a message.
    if (content.startsWith("/") || /^(exit|quit)$/i.test(content)) {
      const [command, ...rest] = content.replace(/^\//, "").split(/\s+/);
      const argument = rest.join(" ");
      switch ((command ?? "").toLowerCase()) {
        case "exit":
        case "quit":
          term.print([blank()]);
          return 0;
        case "help":
          term.print([blank(), ...COMMAND_HELP.map(([name, text]) => line("  ", seg(name.padEnd(18), "strong"), seg(text, "muted"))), blank()]);
          break;
        case "chat":
          mode = "chat";
          term.print([blank()]);
          break;
        case "code":
          if (!("repository" in code)) code = await resolveCodeMode(ctx, project, account);
          if ("repository" in code) mode = "code";
          else term.print([blank(), line("  ", seg("Code changes aren't available here.", "warn")), ...code.unavailable.map(note), note("You can still ask PawOS anything."), blank()]);
          break;
        case "connections":
          await showConnections(ctx);
          break;
        case "connect":
          if ((await connectService(ctx, argument, planLabel)) && !("repository" in code) && project.repository.kind === "github") {
            // GitHub may just have been connected: see whether code changes are possible here now.
            const readiness = await ctx.client.getRepositoryReadiness().catch(() => null);
            if (readiness) account = { ...account, readiness };
          }
          break;
        case "status":
          try {
            term.print([blank(), line("  ", seg("PawOS Account", "strong")), blank(), ...(await accountRows(ctx, project)), blank()]);
          } catch (error) {
            term.print([blank(), ...renderRefusal(error, planLabel, baseUrl(ctx)), blank()]);
          }
          break;
        default:
          term.print([blank(), line("  ", seg(`Unknown command: /${clean(command, 30)}. /help lists the commands.`, "warn")), blank()]);
      }
      continue;
    }

    if (content.length > MAX_TASK_CHARS) {
      term.print([line("  ", seg(`Keep it under ${MAX_TASK_CHARS.toLocaleString("en-US")} characters.`, "warn")), blank()]);
      continue;
    }

    let unauthenticated = false;
    if (mode === "code" && "repository" in code) {
      const task: PendingTask = { requestId: newRequestId(), content, repository: code.repository, startedAt: new Date().toISOString() };
      ctx.pending.write(task); // before it is sent, so an interruption at any point can be picked up again
      const result = await followTask(ctx, task, false, planLabel);
      if (result === "interrupted") return 130;
      unauthenticated = result.status === "failed" && result.error?.kind === "unauthenticated";
    } else {
      const asked = await ask(ctx, content, chatId);
      if (asked.kind === "interrupted") {
        term.print([line("  ", seg("Stopped waiting. Your message was sent once; the reply will be in your PawOS chats.", "muted")), blank()]);
      } else if (asked.kind === "reply") {
        chatId = asked.result.chatId || chatId;
        const reply = cleanLines(asked.result.reply, 400);
        term.print([...(term.caps.interactive ? [] : [blank()]), ...(reply.length > 0 ? reply : ["(PawOS sent an empty reply.)"]).map((text) => (text === "" ? blank() : line("  ", text))), blank()]);
        // PawOS said this needs its desktop app: it was not done here, and the CLI doesn't pretend otherwise.
        if (asked.result.requiresDesktop) term.print([line("  ", seg("PawOS says this needs the PawOS desktop app. Nothing was done from here.", "muted")), blank()]);
      } else {
        unauthenticated = asked.error instanceof PawosApiError && asked.error.kind === "unauthenticated";
        term.print([...(term.caps.interactive ? [] : [blank()]), ...(unauthenticated ? [line("  ", seg(SESSION_EXPIRED_NOTICE, "warn"))] : renderRefusal(asked.error, planLabel, baseUrl(ctx))), blank()]);
      }
    }
    if (unauthenticated) {
      // The session ended and could not be renewed; it has been cleared. Sign in again and stay in PawOS.
      if (!(await browserLogin(ctx))) return 1;
      term.print([blank()]);
    }
  }
  term.print([blank()]);
  return 0;
}
