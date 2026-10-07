/**
 * Everything the CLI prints goes through here: plain lines made of segments, styled only when the
 * terminal can show it. Text that came from PawOS's servers (step labels, summaries, file names,
 * errors) is cleaned before it is printed, so it can never move the cursor, recolour the screen,
 * rewrite earlier output or disguise a link.
 */
export type Tone = "muted" | "accent" | "good" | "bad" | "warn" | "strong";

export interface Segment {
  text: string;
  tone?: Tone;
  /** An https address to make the text clickable, where the terminal supports it. */
  link?: string;
}
export type Line = Segment[];

export const seg = (text: string, tone?: Tone, link?: string): Segment => ({ text, ...(tone ? { tone } : {}), ...(link ? { link } : {}) });
export const line = (...segments: (Segment | string)[]): Line => segments.map((part) => (typeof part === "string" ? seg(part) : part));
export const blank = (): Line => [];

/** The same lines, set in from the left edge like the rest of the interface. */
export const indent = (lines: Line[], by = "  "): Line[] => lines.map((segments) => (segments.length > 0 ? [seg(by), ...segments] : segments));

/** The text of lines with no styling — what a plain terminal, a log file or a test sees. */
export function plain(lines: Line[]): string {
  return lines.map((segments) => segments.map((part) => part.text).join("")).join("\n");
}

// C0 and C1 control characters (including ESC, BEL, CR, backspace and DEL), and the Unicode
// characters that reorder or hide text (bidirectional overrides, zero-width and line separators).
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

const UNSAFE_ANYWHERE = new RegExp(UNSAFE.source);

/** One line of server text, safe to print: control and direction characters removed, whitespace collapsed. */
export function clean(value: unknown, maxLength = 2000): string {
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
  const cleaned = text.replace(/[\r\n\t]+/g, " ").replace(UNSAFE, "").replace(/ {2,}/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

/** Server text that may run over several lines, each cleaned. */
export function cleanLines(value: unknown, maxLines = 40): string[] {
  const text = typeof value === "string" ? value : "";
  const lines = text.split(/\r?\n/).map((part) => clean(part)).filter((part, index, all) => part !== "" || (index > 0 && all[index - 1] !== ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length > maxLines ? [...lines.slice(0, maxLines), "…"] : lines;
}

/** An https address that is safe to print and to link, or null. */
export function cleanUrl(value: unknown): string | null {
  // An address carrying control characters is refused outright, not repaired.
  if (typeof value !== "string" || !value || UNSAFE_ANYWHERE.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const text = url.toString(); // percent-encodes anything that isn't a plain URL character
    return UNSAFE_ANYWHERE.test(text) || /\s/.test(text) ? null : text;
  } catch {
    return null;
  }
}

export interface TerminalCapabilities {
  /** An interactive terminal: output may be redrawn in place. */
  interactive: boolean;
  color: boolean;
  unicode: boolean;
  hyperlinks: boolean;
  columns: number;
}

type Env = Record<string, string | undefined>;

export function detectCapabilities(stream: { isTTY?: boolean; columns?: number }, env: Env, platform: string = process.platform): TerminalCapabilities {
  const tty = stream.isTTY === true;
  const dumb = env.TERM === "dumb";
  const interactive = tty && !dumb && !env.CI && !env.PAWOS_NO_ANIMATION;
  const color = tty && !dumb && env.NO_COLOR === undefined;
  // The classic Windows console draws ✓ ● ○ unreliably; Windows Terminal, VS Code and friends are fine.
  const modernWindows = Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuTask || env.TERM);
  const unicode = env.PAWOS_ASCII === undefined && !dumb && env.TERM !== "linux" && (platform !== "win32" || modernWindows);
  const hyperlinks = color && Boolean(env.WT_SESSION || env.KITTY_WINDOW_ID || env.VTE_VERSION || ["iTerm.app", "vscode", "WezTerm", "Hyper", "ghostty"].includes(env.TERM_PROGRAM ?? ""));
  return { interactive, color, unicode, hyperlinks, columns: Math.max(40, Math.min(stream.columns ?? 80, 120)) };
}

const CODES: Record<Tone, string> = { muted: "2", accent: "36", good: "32", bad: "31", warn: "33", strong: "1" };

export interface Glyphs {
  mark: string;
  done: string;
  active: string;
  pending: string;
  failed: string;
  skipped: string;
  rule: string;
  prompt: string;
  ellipsis: string;
}

export function glyphsFor(unicode: boolean): Glyphs {
  return unicode
    ? { mark: "◉", done: "✓", active: "●", pending: "○", failed: "✕", skipped: "–", rule: "─", prompt: ">", ellipsis: "…" }
    : { mark: "(o)", done: "+", active: "*", pending: "-", failed: "x", skipped: "-", rule: "-", prompt: ">", ellipsis: "..." };
}

/** Where output goes. `write` receives finished text; nothing else in the CLI writes to the screen. */
export interface OutputStream {
  write(text: string): unknown;
  isTTY?: boolean;
  columns?: number;
}

export class Terminal {
  readonly glyphs: Glyphs;
  /** The lines of the in-place display as last drawn (empty when there is none). */
  private liveFrame: string[] = [];
  private cursorHidden = false;

  constructor(
    private readonly out: OutputStream,
    readonly caps: TerminalCapabilities
  ) {
    this.glyphs = glyphsFor(caps.unicode);
  }

  /** One line as terminal text: truncated to the screen when asked, styled when supported. */
  format(segments: Line, maxWidth?: number): string {
    let room = maxWidth ?? Number.POSITIVE_INFINITY;
    let text = "";
    for (const part of segments) {
      if (room <= 0) break;
      const chars = [...part.text];
      const shown = chars.length > room ? `${chars.slice(0, Math.max(0, room - 1)).join("")}${this.caps.unicode ? "…" : "~"}` : part.text;
      room -= [...shown].length;
      let styled = this.caps.color && part.tone ? `\u001b[${CODES[part.tone]}m${shown}\u001b[0m` : shown;
      const url = this.caps.hyperlinks ? cleanUrl(part.link) : null;
      if (url) styled = `\u001b]8;;${url}\u001b\\${styled}\u001b]8;;\u001b\\`;
      text += styled;
    }
    return text;
  }

  /** Prints lines below whatever is on screen. */
  print(lines: Line[]): void {
    this.endLive();
    for (const segments of lines) this.out.write(`${this.format(segments)}\n`);
  }

  /**
   * Draws lines in place, replacing what the previous `live` call drew — for the progress display.
   * Only the lines that actually changed are rewritten: when the PawOS mark pulses, one line is
   * touched and the rest of the screen is left exactly as it is, so nothing flickers and nothing
   * above the display is ever disturbed. On a terminal that can't redraw, nothing is drawn here:
   * the caller prints changes as plain lines.
   */
  live(lines: Line[]): void {
    if (!this.caps.interactive) return;
    if (!this.cursorHidden) {
      this.out.write("\u001b[?25l");
      this.cursorHidden = true;
    }
    const next = lines.map((segments) => this.format(segments, this.caps.columns - 1));
    const previous = this.liveFrame;
    let frame = previous.length > 0 ? `\u001b[${previous.length}A` : "";
    next.forEach((text, index) => {
      // An unchanged line is stepped over; a changed or new one is cleared and rewritten.
      frame += index < previous.length && previous[index] === text ? "\u001b[1B" : `\r\u001b[2K${text}\n`;
    });
    frame += "\r";
    // Fewer lines than last time: clear what is left of the old frame.
    if (next.length < previous.length) frame += "\u001b[0J";
    this.out.write(frame);
    this.liveFrame = next;
  }

  /** Erases the in-place display and gives the cursor back. Always called before anything else is printed. */
  endLive(): void {
    if (this.liveFrame.length > 0) this.out.write(`\u001b[${this.liveFrame.length}A\r\u001b[0J`);
    this.liveFrame = [];
    if (this.cursorHidden) {
      this.out.write("\u001b[?25h");
      this.cursorHidden = false;
    }
  }

  rule(): Line {
    return [seg(this.glyphs.rule.repeat(Math.min(40, this.caps.columns - 4)), "muted")];
  }
}
