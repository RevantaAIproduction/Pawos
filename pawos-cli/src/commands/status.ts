import type { CliContext } from "../context";
import type { ProjectContext } from "../git/localRepository";
import { PawosApiError, SESSION_EXPIRED_NOTICE, describeRepository, type AccountOverview, type Integration } from "../shared";
import { capabilityRow, connectionsRow, creditsRow, usageRows } from "../ui/account";
import { clean, line, seg, type Line, type Tone } from "../ui/terminal";

const row = (label: string, value: string, tone?: Tone): Line => line("  ", seg(label.padEnd(16), "muted"), seg(value, tone));

function folderOf(project: ProjectContext): string {
  const local = project.repository;
  return local.kind === "github" ? local.fullName : local.kind === "notGit" ? "not a Git repository" : local.kind === "gitMissing" ? "Git isn't installed" : local.kind === "noRemote" ? "no Git remote" : "not a GitHub repository";
}

/**
 * The account and the project, as rows. Everything about the account — plan, usage, credits,
 * capabilities, connections — is what PawOS returned just now; a value PawOS didn't return has no
 * row. No token, key or payment detail is ever part of it.
 */
export async function accountRows(ctx: CliContext, project: ProjectContext): Promise<Line[]> {
  const { session } = ctx;
  const local = project.repository;
  const [capabilities, readiness] = await Promise.all([ctx.client.getCapabilities(), ctx.client.getRepositoryReadiness()]);
  // The rest is extra: if PawOS can't serve it right now, those rows are left out rather than guessed.
  const overview: AccountOverview | null = await ctx.client.getOverview().catch(() => null);
  const integrations: Integration[] | null = await ctx.client.listIntegrations().catch(() => null);

  const repo = describeRepository(readiness, local.kind === "github" ? local.fullName : null);
  const storage = ctx.store.storage === "keychain" ? "system credential store" : ctx.store.storage === "file" ? `protected file (${ctx.store.filePath})` : "this run only";
  const rows: Line[] = [
    row("Account", [session.email ? clean(session.email, 120) : "signed in", clean(capabilities.plan?.label, 60)].filter(Boolean).join(" · ")),
    ...usageRows(overview),
    ...creditsRow(overview),
    ...capabilityRow(capabilities, "web.codeChanges", "Code changes"),
    ...capabilityRow(capabilities, "web.autonomousWork", "Autonomous Work"),
    ...capabilityRow(capabilities, "web.mcpRead", "Connected tools"),
    ...connectionsRow(integrations),
    row("Session", storage),
    row("Folder", folderOf(project)),
    row("PawOS", repo.selected ? `${clean(repo.selected, 200)}${repo.defaultBranch ? ` (${clean(repo.defaultBranch, 100)})` : ""}` : clean(repo.message) || "no repository selected"),
  ];
  if (repo.selected && local.kind === "github") rows.push(row("Match", repo.mismatch ? "no — run pawos to choose" : "yes", repo.mismatch ? "warn" : "good"));
  return rows;
}

/** `pawos status` — who is signed in, what the account has, and how this folder relates to PawOS. Changes nothing. */
export async function status(ctx: CliContext): Promise<number> {
  const { term, session } = ctx;
  term.print([line(seg(`PawOS v${ctx.version}`, "strong"))]);
  if (!ctx.config.ok) {
    term.print([row("PawOS", ctx.config.problem, "bad")]);
    return 2;
  }

  const project = await ctx.detectProject();
  await session.initialize();
  if (session.status !== "signedIn") {
    term.print([row("Account", "not signed in"), row("Folder", folderOf(project)), line(), line(seg("Run pawos login to sign in.", "muted"))]);
    return 1;
  }

  try {
    term.print(await accountRows(ctx, project));
    return 0;
  } catch (error) {
    if (error instanceof PawosApiError && error.kind === "unauthenticated") {
      term.print([row("Account", SESSION_EXPIRED_NOTICE, "warn"), row("Folder", folderOf(project))]);
      return 1;
    }
    term.print([row("Account", session.email ? clean(session.email, 120) : "signed in"), row("Folder", folderOf(project)), row("PawOS", clean(error instanceof Error ? error.message : "couldn't be reached"), "bad")]);
    return 1;
  }
}
