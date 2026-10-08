import type { Timers } from "./spinner";
import { clean, line, seg, type Line, type Terminal } from "./terminal";

/**
 * PawOS coming online: the wordmark itself builds letter by letter, a highlight passes across it,
 * and it settles into the first line of the header. One line, drawn in place, once — about a
 * second. There is no logo and nothing else moves. On a terminal that can't redraw in place there
 * are no frames at all: the header is simply printed.
 */
export const WORDMARK = "PawOS";
export const INTRO_FRAME_MS = 70;

const realTimers: Timers = { setInterval: (run, ms) => setInterval(run, ms), clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout) };

/** The first line of the header as it stands once the animation has settled. */
export function wordmarkLine(version: string): Line {
  return line("  ", seg(WORDMARK, "strong"), seg(` v${version}`, "muted"));
}

/** Every frame of the animation, in order. The last one is the settled header line. */
export function introFrames(version: string, unicode: boolean): Line[] {
  const letters = [...WORDMARK];
  const waiting = unicode ? "·" : ".";
  const frames: Line[] = [];
  // Build: each letter arrives lit, the ones before it settle, the ones to come are faint dots.
  for (let shown = 1; shown <= letters.length; shown++) {
    frames.push(line("  ", seg(letters.slice(0, shown - 1).join(""), "strong"), seg(letters[shown - 1]!, "accent"), seg(waiting.repeat(letters.length - shown), "muted")));
  }
  // Online: a highlight passes once across the finished word.
  for (let lit = 0; lit < letters.length; lit++) {
    frames.push(line("  ", seg(letters.slice(0, lit).join(""), "strong"), seg(letters[lit]!, "accent"), seg(letters.slice(lit + 1).join(""), "strong")));
  }
  // Settle: the word, then its version.
  frames.push(line("  ", seg(WORDMARK, "strong")), wordmarkLine(version), wordmarkLine(version));
  return frames;
}

export class StartupIntro {
  private timer: unknown = null;
  private index = 0;
  private readonly frames: Line[];
  private done!: () => void;
  /** Settles when the last frame has been drawn — at once when there is no animation. */
  readonly finished: Promise<void>;

  constructor(
    private readonly term: Terminal,
    version: string,
    private readonly timers: Timers = realTimers,
    enabled = true
  ) {
    this.frames = enabled && term.caps.interactive ? introFrames(version, term.caps.unicode) : [];
    this.finished = new Promise<void>((resolve) => (this.done = resolve));
  }

  get animated(): boolean {
    return this.frames.length > 0;
  }

  start(): void {
    if (!this.animated) return this.done();
    this.term.live([this.frames[0]!]);
    this.timer = this.timers.setInterval(() => {
      this.index += 1;
      if (this.index < this.frames.length) this.term.live([this.frames[this.index]!]);
      if (this.index >= this.frames.length - 1) this.settle();
    }, INTRO_FRAME_MS);
  }

  /** Ends the animation and hands its line back: the header is printed in its place. Safe to call at any time. */
  stop(): void {
    this.settle();
    this.term.endLive();
  }

  private settle(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    this.done();
  }
}

/** "Good morning", "Good afternoon" or "Good evening", by the clock on this computer. */
export function timeOfDay(now: Date): string {
  const hour = now.getHours();
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The first name to greet, from the name PawOS returned for the account — or null when there isn't
 * a usable one. Anything that looks like an email address, a link or an identifier is not a name
 * and is never shown.
 */
export function firstName(name: unknown): string | null {
  const first = clean(name, 200).split(" ")[0] ?? "";
  if (!first || [...first].length > 30) return null;
  if (!/^\p{L}[\p{L}\p{M}'’.-]*$/u.test(first)) return null;
  return first;
}

export function greeting(name: unknown, now: Date): string {
  const first = firstName(name);
  return first ? `${timeOfDay(now)}, ${first}.` : "Welcome back.";
}
