import type { CliContext } from "../context";
import { blank, clean, cleanUrl, indent, line, seg, type Line } from "../ui/terminal";

const MAX_PASTE_ATTEMPTS = 3;

/**
 * Signs the CLI in through the browser:
 *
 *   the CLI prints PawOS's sign-in address → the user opens it in whichever browser they choose,
 *   signs in the way they always do (Google, GitHub or email) and clicks Authorize → PawOS shows
 *   an authentication URL → the user pastes it here → the CLI checks it is PawOS's own completion
 *   address, exchanges the one-time handoff in it for its own session, and stores that session in
 *   the credential store.
 *
 * The CLI never starts a browser, never opens or follows the pasted address (it is only read as
 * text), never asks for a password or a token, and never prints the handoff or the session. The
 * address it prints carries only a one-way challenge — the secret behind it stays in this process.
 */
export async function browserLogin(ctx: CliContext): Promise<boolean> {
  const { term, prompter, session } = ctx;
  const say = (lines: Line[]) => term.print(indent(lines));
  if (!ctx.config.ok) {
    say([line(seg(term.glyphs.failed, "bad"), " ", ctx.config.problem)]);
    return false;
  }
  const pending = session.beginSignIn("cli");
  const address = cleanUrl(pending.url) ?? pending.url;

  say([blank(), line(seg("PawOS CLI", "strong")), blank(), line("To sign in, open this URL in your browser:"), blank()]);
  // The address on a line of its own, from the left edge and in one piece: nothing before or after
  // it to pick up when it is selected, and no line break inside it for a terminal to copy.
  term.print([line(seg(address, "accent", address))]);
  say([blank(), line("After signing in, copy the authentication URL"), line("shown by PawOS and paste it below."), blank()]);

  for (let attempt = 1; attempt <= MAX_PASTE_ATTEMPTS; attempt++) {
    const answer = await prompter.ask("  Authentication URL:\n  > ");
    if (answer === null || !answer.trim()) {
      pending.cancel();
      say([line(seg("Sign-in cancelled.", "muted"))]);
      return false;
    }
    // Checked here, before anything is sent: it must be PawOS's own completion address. What was
    // pasted is never echoed back — the reason says what was wrong without repeating it.
    const checked = pending.check(answer);
    if (!checked.ok) {
      say([line(seg(checked.reason, "warn")), blank()]);
      continue;
    }
    try {
      await pending.complete(answer);
    } catch (error) {
      say([line(seg(term.glyphs.failed, "bad"), " ", clean(error instanceof Error ? error.message : "Sign-in failed.")), line(seg("Run pawos login to try again.", "muted"))]);
      return false;
    }
    say([blank(), line(seg(term.glyphs.done, "good"), ` Signed in as ${clean(session.email, 120) || "your PawOS account"}`)]);
    if (ctx.store.storage === "file") {
      say([line(seg("No system credential store is available, so the session is kept in a file only you can read:", "warn")), line("  ", seg(ctx.store.filePath, "muted"))]);
    }
    return true;
  }
  pending.cancel();
  say([line(seg("Sign-in cancelled after too many attempts. Run pawos login to try again.", "muted"))]);
  return false;
}
