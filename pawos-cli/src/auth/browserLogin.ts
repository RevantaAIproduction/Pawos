import type { CliContext } from "../context";
import { looksLikeLoginCode } from "../shared";
import { blank, clean, cleanUrl, indent, line, seg, type Line } from "../ui/terminal";

const MAX_CODE_ATTEMPTS = 3;

/**
 * Signs the CLI in through the browser:
 *
 *   the CLI opens PawOS in the browser → the user signs in the way they always do (Google, GitHub
 *   or email) and confirms → PawOS shows a one-time code → the user pastes it here → the CLI
 *   exchanges it for its own session, which goes straight into the credential store.
 *
 * The CLI never asks for a password or a token, and never prints the session. The address it opens
 * (and prints, in case the browser doesn't open) carries only a one-way challenge.
 */
export async function browserLogin(ctx: CliContext, options: { announce?: boolean } = {}): Promise<boolean> {
  const { term, prompter, session } = ctx;
  const say = (lines: Line[]) => term.print(indent(lines));
  if (!ctx.config.ok) {
    say([line(seg(term.glyphs.failed, "bad"), " ", ctx.config.problem)]);
    return false;
  }
  const pending = session.beginSignIn("cli");
  const address = cleanUrl(pending.url) ?? pending.url;
  say([blank(), line(seg("PawOS Authentication", "strong")), blank(), line(seg(`Opening your browser${term.glyphs.ellipsis}`, "muted"))]);
  const opened = await ctx.openBrowser(pending.url);
  say([
    line(seg(opened ? "If it didn't open, visit:" : "Your browser couldn't be opened. Visit:", "muted")),
    line("  ", seg(address, "accent", address)),
    blank(),
    line("Sign in to PawOS, then paste the authentication code it shows you."),
    blank(),
  ]);

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const answer = await prompter.ask("  Paste authentication code:\n  > ");
    if (answer === null || !answer.trim()) {
      pending.cancel();
      say([line(seg("Sign-in cancelled.", "muted"))]);
      return false;
    }
    // A mistyped code is caught here, before it is sent: a code PawOS has seen can't be tried again.
    if (!looksLikeLoginCode(answer)) {
      say([line(seg("That doesn't look like a PawOS code. It looks like PAWOS-XXXX-XXXX.", "warn"))]);
      continue;
    }
    try {
      await pending.complete(answer);
    } catch (error) {
      say([line(seg(term.glyphs.failed, "bad"), " ", clean(error instanceof Error ? error.message : "Sign-in failed.")), line(seg("Run pawos login to try again.", "muted"))]);
      return false;
    }
    // `pawos` shows the account in its own checklist straight after; `pawos login` says it here.
    if (options.announce !== false) say([blank(), line(seg(term.glyphs.done, "good"), " Signed in", ...(session.email ? [seg(`  ${clean(session.email, 120)}`, "muted")] : []))]);
    if (ctx.store.storage === "file") {
      say([line(seg("No system credential store is available, so the session is kept in a file only you can read:", "warn")), line("  ", seg(ctx.store.filePath, "muted"))]);
    }
    return true;
  }
  pending.cancel();
  say([line(seg("Sign-in cancelled after too many attempts. Run pawos login to try again.", "muted"))]);
  return false;
}
