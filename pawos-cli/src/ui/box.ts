import { blank, line, plain, seg, type Line, type Segment } from "./terminal";

/**
 * The start screen for someone who has used PawOS before: one box with the mascot on the left and
 * their recent work on the right. It is only drawn when there is recent work to put in it — with
 * none there is no box at all, just the mascot and the header.
 *
 * The box starts at the left edge so the mascot inside it sits in exactly the columns it was
 * animated in: when the animation settles and the box is drawn around it, the mascot does not move.
 */
interface BoxParts {
  h: string;
  v: string;
  topLeft: string;
  topMid: string;
  topRight: string;
  bottomLeft: string;
  bottomMid: string;
  bottomRight: string;
}

const UNICODE_BOX: BoxParts = { h: "─", v: "│", topLeft: "┌", topMid: "┬", topRight: "┐", bottomLeft: "└", bottomMid: "┴", bottomRight: "┘" };
const ASCII_BOX: BoxParts = { h: "-", v: "|", topLeft: "+", topMid: "+", topRight: "+", bottomLeft: "+", bottomMid: "+", bottomRight: "+" };

const width = (segments: Line): number => [...plain([segments])].length;

/** A line cut to `max` characters (with an ellipsis), keeping each part's styling. */
export function fit(segments: Line, max: number, ellipsis: string): Line {
  if (width(segments) <= max) return segments;
  const out: Segment[] = [];
  let room = Math.max(0, max - [...ellipsis].length);
  for (const part of segments) {
    if (room <= 0) break;
    const chars = [...part.text];
    out.push({ ...part, text: chars.slice(0, room).join("") });
    room -= Math.min(chars.length, room);
  }
  return [...out, seg(ellipsis, "muted")];
}

/** The narrowest the right-hand column may be before the box is not worth drawing. */
export const MIN_RIGHT_WIDTH = 24;

/**
 * Two columns in one box. `left` lines are expected to begin with the interface's two-space
 * indent, which the box's own edge replaces. Returns null when the terminal is too narrow for it —
 * the caller then lays the same content out without a box.
 */
export function twoColumnBox(left: Line[], right: Line[], columns: number, unicode: boolean): Line[] | null {
  const parts = unicode ? UNICODE_BOX : ASCII_BOX;
  const ellipsis = unicode ? "…" : "...";
  // Drop the two-space indent: "│ " takes its place, so the content keeps its columns.
  const leftRows = left.map((segments) => (segments[0]?.text === "  " ? segments.slice(1) : segments));
  const leftWidth = Math.max(...leftRows.map(width));
  const wanted = Math.max(...right.map(width));
  // │ + space + left + two spaces + │ + space + right + space + │
  const room = columns - 1 - (leftWidth + 8);
  // Too narrow to say anything useful on the right: no box.
  if (room < Math.min(wanted, MIN_RIGHT_WIDTH)) return null;
  const rightWidth = Math.min(wanted, room);
  const rows = Math.max(leftRows.length, right.length);
  const edge = (text: string): Segment => seg(text, "muted");
  const pad = (segments: Line, to: number): Line => [...segments, seg(" ".repeat(Math.max(0, to - width(segments))))];

  const body: Line[] = [];
  for (let row = 0; row < rows; row++) {
    const l = leftRows[row] ?? blank();
    const r = fit(right[row] ?? blank(), rightWidth, ellipsis);
    body.push(line(edge(parts.v), " ", ...pad(l, leftWidth), "  ", edge(parts.v), " ", ...pad(r, rightWidth), " ", edge(parts.v)));
  }
  const rule = (a: string, b: string, c: string): Line => line(edge(`${a}${parts.h.repeat(leftWidth + 3)}${b}${parts.h.repeat(rightWidth + 2)}${c}`));
  return [rule(parts.topLeft, parts.topMid, parts.topRight), ...body, rule(parts.bottomLeft, parts.bottomMid, parts.bottomRight)];
}
