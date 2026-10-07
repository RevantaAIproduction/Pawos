import { blank, line, seg, type Line, type Terminal } from "./terminal";

/**
 * The PawOS mark, breathing while PawOS works: ◉ ◎ ○ ◎ … — one character, a slow pulse, nothing
 * else moving. On a terminal that can't redraw in place there is no animation at all: the same
 * information is printed once, as ordinary lines.
 */
export const MARK_FRAMES = ["◉", "◉", "◎", "○", "◎"] as const;
export const ASCII_MARK_FRAMES = ["(o)", "(o)", "(O)", "( )", "(O)"] as const;
export const FRAME_MS = 220;

export function markFrame(tick: number, unicode: boolean): string {
  const frames = unicode ? MARK_FRAMES : ASCII_MARK_FRAMES;
  return frames[((tick % frames.length) + frames.length) % frames.length]!;
}

export interface Timers {
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const realTimers: Timers = { setInterval: (run, ms) => setInterval(run, ms), clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout) };

/**
 * A status display that is redrawn in place: an animated PawOS mark with a title, and whatever
 * lines the caller supplies under it. `stop()` always leaves the terminal clean — the display is
 * erased, the cursor is back, and the timer is gone — whether the work finished, failed or was
 * interrupted.
 */
export class LiveStatus {
  private tick = 0;
  private timer: unknown = null;
  private title = "";
  private body: Line[] = [];
  private printed = new Set<string>();

  constructor(
    private readonly term: Terminal,
    private readonly timers: Timers = realTimers
  ) {}

  get running(): boolean {
    return this.timer !== null || this.title !== "";
  }

  start(title: string, body: Line[] = []): void {
    this.title = title;
    this.body = body;
    if (this.term.caps.interactive) {
      this.draw();
      this.timer ??= this.timers.setInterval(() => {
        this.tick += 1;
        this.draw();
      }, FRAME_MS);
    } else {
      // No animation: say it once, plainly.
      this.printOnce(line(seg(this.term.glyphs.mark, "accent"), " ", title));
      this.printChanged(body);
    }
  }

  /** New content under the title (the task's steps, as PawOS reports them). */
  update(body: Line[], title: string = this.title): void {
    if (!this.running) return;
    this.title = title;
    this.body = body;
    if (this.term.caps.interactive) this.draw();
    else this.printChanged(body);
  }

  stop(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    this.title = "";
    this.body = [];
    this.printed.clear();
    this.term.endLive();
  }

  private draw(): void {
    const mark = markFrame(this.tick, this.term.caps.unicode);
    this.term.live([line("  ", seg(mark, "accent"), " ", seg(this.title, "strong")), blank(), ...this.body]);
  }

  private key(segments: Line): string {
    return segments.map((part) => part.text).join("");
  }

  private printOnce(segments: Line): void {
    const key = this.key(segments);
    if (this.printed.has(key)) return;
    this.printed.add(key);
    this.term.print([line("  ", ...segments)]);
  }

  /** Static fallback: each line is printed when it first appears or changes — never redrawn. */
  private printChanged(body: Line[]): void {
    for (const segments of body) if (this.key(segments).trim()) this.printOnce(segments.filter((part, index) => !(index === 0 && part.text.trim() === "")));
  }
}
