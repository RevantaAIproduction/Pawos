import { interactive } from "./commands/interactive";
import { status } from "./commands/status";
import type { CliContext } from "./context";
import { line, seg, type Line } from "./ui/terminal";

/**
 * The `pawos` command. `pawos` on its own is the product — the interactive workspace; `pawos login`
 * signs in and opens that same workspace; the other subcommands print something and exit.
 */
export const COMMANDS = ["version", "login", "logout", "status", "help"] as const;

export function usage(version: string): Line[] {
  const command = (name: string, text: string): Line => line("  ", seg(name.padEnd(16), "strong"), seg(text, "muted"));
  return [
    line(seg(`PawOS v${version}`, "strong")),
    line(),
    line("Usage"),
    command("pawos", "Open PawOS, from any folder"),
    command("pawos login", "Sign in, then open PawOS"),
    command("pawos logout", "Sign out on this computer"),
    command("pawos status", "Show your account, plan, usage and connections"),
    command("pawos version", "Show the version"),
    line(),
    line(seg("Inside PawOS, /help lists what you can do. Code changes are made in", "muted")),
    line(seg("your connected GitHub project, not in the files on this computer.", "muted")),
  ];
}

/** Runs one invocation and resolves its exit code. Never throws for a user-level problem. */
export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
  const [command, ...rest] = argv;
  const { term } = ctx;
  const tooMany = () => {
    term.print([line(seg(`pawos ${command} takes no arguments.`, "warn"))]);
    return 2;
  };

  switch (command) {
    case undefined:
      return interactive(ctx);
    case "version":
    case "--version":
    case "-v":
    case "-V":
      term.print([line(`PawOS v${ctx.version}`)]);
      return 0;
    case "help":
    case "--help":
    case "-h":
      term.print(usage(ctx.version));
      return 0;
    case "login":
      if (rest.length > 0) return tooMany();
      // Sign in, then straight into the same workspace `pawos` opens: one session, no second command.
      return interactive(ctx, { signIn: true });
    case "logout": {
      if (rest.length > 0) return tooMany();
      await ctx.session.initialize();
      const wasSignedIn = ctx.session.status === "signedIn";
      await ctx.session.signOut();
      term.print([line(wasSignedIn ? "Signed out of PawOS on this computer." : "You weren't signed in.")]);
      return 0;
    }
    case "status":
      if (rest.length > 0) return tooMany();
      return status(ctx);
    default:
      // A task is typed inside `pawos`, not after it: say so rather than guess.
      term.print([line(seg(`Unknown command: ${command.replace(/[^\w./-]/g, "?").slice(0, 40)}`, "warn")), line(), ...usage(ctx.version)]);
      return 2;
  }
}
