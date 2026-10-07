import type { CliContext } from "../context";
import { PawosApiError, SESSION_EXPIRED_NOTICE, describeRepository } from "../shared";
import { clean, line, seg, type Line } from "../ui/terminal";

const row = (label: string, value: string, tone?: Parameters<typeof seg>[1]): Line => line("  ", seg(label.padEnd(12), "muted"), seg(value, tone));

/** `pawos status` — who is signed in, where the session is kept, and whether this folder matches PawOS. Changes nothing. */
export async function status(ctx: CliContext): Promise<number> {
  const { term, session } = ctx;
  term.print([line(seg(`PawOS v${ctx.version}`, "strong"))]);
  if (!ctx.config.ok) {
    term.print([row("PawOS", ctx.config.problem, "bad")]);
    return 2;
  }

  const local = await ctx.detectRepository();
  const folder = local.kind === "github" ? local.fullName : local.kind === "notGit" ? "not a Git repository" : local.kind === "gitMissing" ? "Git isn't installed" : local.kind === "noRemote" ? "no Git remote" : "not a GitHub repository";

  await session.initialize();
  if (session.status !== "signedIn") {
    term.print([row("Account", "not signed in"), row("Folder", folder), line(), line(seg("Run pawos login to sign in.", "muted"))]);
    return 1;
  }

  try {
    const [capabilities, readiness] = await Promise.all([ctx.client.getCapabilities(), ctx.client.getRepositoryReadiness()]);
    const repo = describeRepository(readiness, local.kind === "github" ? local.fullName : null);
    const storage = ctx.store.storage === "keychain" ? "system credential store" : ctx.store.storage === "file" ? `protected file (${ctx.store.filePath})` : "this run only";
    const lines: Line[] = [
      row("Account", [session.email ? clean(session.email, 120) : "signed in", clean(capabilities.plan?.label, 60)].filter(Boolean).join(" · ")),
      row("Session", storage),
      row("Folder", folder),
      row("PawOS", repo.selected ? `${clean(repo.selected, 200)}${repo.defaultBranch ? ` (${clean(repo.defaultBranch, 100)})` : ""}` : (clean(repo.message) || "no repository selected")),
    ];
    if (repo.selected && local.kind === "github") lines.push(row("Match", repo.mismatch ? "no — run pawos to choose" : "yes", repo.mismatch ? "warn" : "good"));
    term.print(lines);
    return 0;
  } catch (error) {
    if (error instanceof PawosApiError && error.kind === "unauthenticated") {
      term.print([row("Account", SESSION_EXPIRED_NOTICE, "warn"), row("Folder", folder)]);
      return 1;
    }
    term.print([row("Account", session.email ? clean(session.email, 120) : "signed in"), row("Folder", folder), row("PawOS", clean(error instanceof Error ? error.message : "couldn't be reached"), "bad")]);
    return 1;
  }
}
