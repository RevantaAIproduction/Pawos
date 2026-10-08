import type { Timers } from "./spinner";
import { blank, clean, line, seg, type Line, type Segment, type Terminal } from "./terminal";

/**
 * The PawOS mascot: the PawOS companion — the small robot with the visor and the antenna that is
 * PawOS's own mascot on the desktop and the web — drawn in a few characters, in PawOS red. It sits
 * at the top of the workspace, beside the name and the greeting, and it stays there.
 *
 * When PawOS opens on a terminal that can redraw in place, the mascot wakes up first: it opens its
 * eyes, gives a little bounce, blinks and settles, its antenna light pulsing — about a second and a
 * half, once, in its own five lines — and then stands still as the header. Where the terminal can't
 * redraw there are no frames: the same mascot is simply printed, settled.
 *
 * It is text only: box-drawing characters where the terminal can show them, plain ASCII where it
 * can't (the classic Windows console).
 */
export const INTRO_FRAME_MS = 120;
/** The animation's own area: four lines of mascot and one for it to bounce in. */
export const INTRO_HEIGHT = 5;
/** How many frames the antenna light stays on, then off, while PawOS is still loading after the animation. */
export const IDLE_PULSE_FRAMES = 4;
export const TAGLINE = "AI Developer Workspace";

const realTimers: Timers = { setInterval: (run, ms) => setInterval(run, ms), clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout) };

type Eyes = "closed" | "open" | "happy";

interface Pose {
  eyes: Eyes;
  /** Up off the ground: the top of a bounce. */
  up: boolean;
  /** The antenna light is on. */
  lit: boolean;
  /** The name beside it has appeared. */
  named: boolean;
}

/** What happens, pose by pose: asleep, awake, a bounce, a blink, a happy little hop, settled. */
const POSES: Pose[] = [
  { eyes: "closed", up: false, lit: false, named: false },
  { eyes: "closed", up: false, lit: true, named: false },
  { eyes: "open", up: false, lit: false, named: true },
  { eyes: "open", up: true, lit: true, named: true },
  { eyes: "open", up: false, lit: false, named: true },
  { eyes: "open", up: false, lit: true, named: true },
  { eyes: "closed", up: false, lit: false, named: true },
  { eyes: "open", up: false, lit: true, named: true },
  { eyes: "happy", up: true, lit: false, named: true },
  { eyes: "happy", up: false, lit: true, named: true },
  { eyes: "happy", up: true, lit: false, named: true },
  { eyes: "happy", up: false, lit: true, named: true },
  { eyes: "happy", up: false, lit: true, named: true },
];
/** How the mascot stands once it has settled — and how it is drawn in the header. */
const SETTLED: Pick<Pose, "eyes" | "lit"> = { eyes: "happy", lit: true };

interface Parts {
  antennaOn: string;
  antennaOff: string;
  top: string;
  side: string;
  bottom: string;
  eye: Record<Eyes, string>;
}

const UNICODE_PARTS: Parts = { antennaOn: "●", antennaOff: "○", top: "┌──┴──┐", side: "│", bottom: "└─────┘", eye: { closed: "─", open: "●", happy: "^" } };
const ASCII_PARTS: Parts = { antennaOn: "*", antennaOff: "o", top: ".--+--.", side: "|", bottom: "'-----'", eye: { closed: "-", open: "o", happy: "^" } };

/** The mascot in one pose: four lines, the head seven characters wide, in PawOS red. */
export function mascot(pose: Pick<Pose, "eyes" | "lit">, unicode: boolean): Line[] {
  const parts = unicode ? UNICODE_PARTS : ASCII_PARTS;
  const eye = seg(parts.eye[pose.eyes], "strong");
  return [
    line("   ", seg(pose.lit ? parts.antennaOn : parts.antennaOff, pose.lit ? "brand" : "muted")),
    line(seg(parts.top, "brand")),
    line(seg(`${parts.side} `, "brand"), eye, " ", eye, seg(` ${parts.side}`, "brand")),
    line(seg(parts.bottom, "brand")),
  ];
}

const titleLine = (version: string): (Segment | string)[] => [seg("PawOS", "strong"), seg(` v${version}`, "muted")];
const beside = (row: Line, text: (Segment | string)[]): Line => (text.length > 0 ? line("  ", ...row, "   ", ...text) : line("  ", ...row));

/**
 * The top of the workspace: the settled mascot with PawOS's name and version, what it is, and the
 * greeting beside it. Four lines, always shown — this is where the mascot stays.
 */
export function mascotHeader(version: string, greetingText: string, unicode: boolean): Line[] {
  const [antenna, top, eyes, bottom] = mascot(SETTLED, unicode) as [Line, Line, Line, Line];
  return [beside(antenna, []), beside(top, titleLine(version)), beside(eyes, [seg(TAGLINE, "muted")]), beside(bottom, [greetingText])];
}

function poseFrame(pose: Pose, version: string, unicode: boolean): Line[] {
  const body = mascot(pose, unicode);
  // A bounce moves the mascot up one line; the name beside it stays where it will be in the header.
  const rows: Line[] = pose.up ? [...body, blank()] : [blank(), ...body];
  return rows.map((row, index) => {
    const text = !pose.named ? [] : index === 2 ? titleLine(version) : index === 3 ? [seg(TAGLINE, "muted")] : [];
    return row.length === 0 ? blank() : beside(row, text);
  });
}

/** Every frame of the animation, in order: each is the whole five-line area. */
export function introFrames(version: string, unicode: boolean): Line[][] {
  return POSES.map((pose) => poseFrame(pose, version, unicode));
}

/** The settled mascot with its antenna light on or off: what is shown, gently pulsing, if PawOS is still loading. */
export function idleFrame(lit: boolean, version: string, unicode: boolean): Line[] {
  return poseFrame({ ...POSES[POSES.length - 1]!, lit }, version, unicode);
}

export class StartupIntro {
  private timer: unknown = null;
  private index = 0;
  private readonly frames: Line[][];
  private done!: () => void;
  /** Settles when the last frame has been drawn — at once when there is no animation. */
  readonly finished: Promise<void>;

  constructor(
    private readonly term: Terminal,
    private readonly version: string,
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
    this.term.live(this.frames[0]!);
    this.timer = this.timers.setInterval(() => {
      this.index += 1;
      if (this.index < this.frames.length) this.term.live(this.frames[this.index]!);
      else {
        // The animation is over but PawOS is still loading: the mascot waits, its antenna light pulsing slowly.
        const waited = this.index - this.frames.length;
        this.term.live(idleFrame(Math.floor(waited / IDLE_PULSE_FRAMES) % 2 === 1, this.version, this.term.caps.unicode));
      }
      if (this.index >= this.frames.length - 1) this.done();
    }, INTRO_FRAME_MS);
  }

  /**
   * Ends the animation. Its five lines are handed back so the header — the same mascot, settled,
   * now with the greeting — is printed exactly where it stood. Safe to call at any time.
   */
  stop(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    this.done();
    this.term.endLive();
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
