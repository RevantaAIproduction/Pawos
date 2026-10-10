import * as fs from "fs";
import * as path from "path";
import { AGENT_CLIENT_LIMITS, toolRisk, type ToolCall, type ToolResult } from "../shared";
import { protectedReason, resolveForChange, type Workspace } from "./workspace";

/**
 * The local tools that change the project: write_file, edit_file and delete_path.
 *
 * A change happens in two steps, and only this file takes the second one.
 *   prepareChange  checks the request and works out exactly what would happen — without touching
 *                  anything. It answers with a Proposal the user can read, or a refusal.
 *   proposal.apply makes the change. It is called only after the user has said yes, and it checks
 *                  everything again first: the path, and that the file is still what was shown.
 *
 * Nothing here decides whether the user agrees — the loop asks them (local/agent.ts) — and nothing
 * PawOS's service sends can skip the question. This file runs no program and never touches Git.
 */

const LIMITS = AGENT_CLIENT_LIMITS;
/** Lines of a change shown to the user before they decide. */
export const PREVIEW_LINES = 40;
const PREVIEW_LINE_CHARS = 160;
/** Entries a folder may hold and still be deleted from here. */
export const DELETE_ENTRIES = 2000;
const DELETE_NAMES_SHOWN = 12;

export interface PreviewLine {
  sign: "+" | "-" | " ";
  text: string;
}

export interface Proposal {
  tool: "write_file" | "edit_file" | "delete_path";
  /** Decided here from the tool's name: a write, or a delete. */
  risk: "write" | "delete";
  operation: "Create file" | "Replace file" | "Edit file" | "Delete file" | "Delete folder";
  /** The path inside the project, with forward slashes. Never a location on this computer. */
  relative: string;
  /** Every file this change touches (for a folder, each file in it): what a recovery copy is kept of. */
  touches: string[];
  /** A line or two on what will happen (new or existing, how much changes). */
  facts: string[];
  /** The change itself, bounded: lines removed and added, or what a folder holds. */
  preview: PreviewLine[];
  previewCut: boolean;
  /** Makes the change. Only ever called after the user approved this exact proposal. */
  apply(): Promise<ToolResult>;
}

export type Prepared = { ok: true; proposal: Proposal } | { ok: false; result: ToolResult };

export interface ChangeEnvironment {
  /** Folders PawOS must never change or delete (its own state directory). */
  forbidden?: string[];
}

const failed = (call: ToolCall, reason: string): Prepared => ({ ok: false, result: { id: call.id, ok: false, output: reason } });
const denied = (call: ToolCall, reason: string): Prepared => ({ ok: false, result: { id: call.id, ok: false, denied: true, output: `Not allowed: ${reason}` } });
const done = (call: ToolCall, output: string): ToolResult => ({ id: call.id, ok: true, output });
const lost = (call: ToolCall, reason: string): ToolResult => ({ id: call.id, ok: false, output: reason });

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);
const lineCount = (text: string) => (text === "" ? 0 : text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0));
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** A line of a file made safe to print: no control or direction-changing characters, tabs as spaces, bounded. */
export function previewText(value: string): string {
  // eslint-disable-next-line no-control-regex
  const shown = value.replace(/\t/g, "  ").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, "");
  return shown.length > PREVIEW_LINE_CHARS ? `${shown.slice(0, PREVIEW_LINE_CHARS - 1)}…` : shown;
}

export interface BoundedDiff {
  /** The first line that differs (1-based). */
  startLine: number;
  removed: number;
  added: number;
  lines: PreviewLine[];
  cut: boolean;
}

/**
 * What changed between two versions of a file, as the lines taken out and the lines put in, with
 * one unchanged line either side. Bounded: a large change shows its beginning and says there is more.
 */
export function boundedDiff(before: string, after: string, maxLines: number = PREVIEW_LINES): BoundedDiff {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const removed = a.slice(start, a.length - end);
  const added = b.slice(start, b.length - end);
  const half = Math.max(1, Math.floor(maxLines / 2));
  const cut = removed.length > half || added.length > half;
  const lines: PreviewLine[] = [];
  if (start > 0) lines.push({ sign: " ", text: previewText(a[start - 1]!) });
  for (const text of removed.slice(0, half)) lines.push({ sign: "-", text: previewText(text) });
  for (const text of added.slice(0, half)) lines.push({ sign: "+", text: previewText(text) });
  if (end > 0 && !cut) lines.push({ sign: " ", text: previewText(a[a.length - end]!) });
  return { startLine: start + 1, removed: removed.length, added: added.length, lines, cut };
}

/** The file as text, or why it can't be worked on. */
async function readText(absolute: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const stat = await fs.promises.stat(absolute).catch(() => null);
  if (!stat) return { ok: false, reason: "That file doesn't exist." };
  if (!stat.isFile()) return { ok: false, reason: "That is not a file." };
  if (stat.size > LIMITS.fileBytes) return { ok: false, reason: `That file is too large to change from here (the limit is ${LIMITS.fileBytes / 1000} KB).` };
  const bytes = await fs.promises.readFile(absolute);
  if (isBinary(bytes)) return { ok: false, reason: "That file isn't text." };
  return { ok: true, text: bytes.toString("utf8") };
}

const tooLarge = (text: string) => Buffer.byteLength(text, "utf8") > LIMITS.fileBytes;
const TOO_LARGE = `That would make the file larger than PawOS writes (the limit is ${LIMITS.fileBytes / 1000} KB).`;
const MOVED = "The file changed while PawOS was waiting for your answer, so nothing was written. Read it again.";

/**
 * Works out what a write, an edit or a delete would do, without doing it. Every check is made here
 * first — the path, the protected files, the sizes, whether the edit fits the file as it is now —
 * so that what the user is shown is exactly what `apply` will do.
 */
export async function prepareChange(call: ToolCall, workspace: Workspace, environment: ChangeEnvironment = {}): Promise<Prepared> {
  const risk = toolRisk(call.name);
  if (risk !== "write" && risk !== "delete") return denied(call, "that isn't a tool that changes files.");
  const text = (key: string): string => (typeof call.args[key] === "string" ? (call.args[key] as string) : "");
  const forbidden = environment.forbidden ?? [];
  const target = resolveForChange(workspace, text("path"), forbidden);
  if (!target.ok) return denied(call, target.reason);
  /** The same checks again, at the moment of the change: the path must still lead where it did. */
  const stillThere = (): boolean => {
    const again = resolveForChange(workspace, text("path"), forbidden);
    return again.ok && again.absolute === target.absolute && again.exists === target.exists;
  };

  try {
    if (call.name === "write_file") {
      const content = text("content");
      if (content.includes("\0")) return failed(call, "PawOS writes text files only.");
      if (tooLarge(content)) return failed(call, TOO_LARGE);
      if (!target.exists) {
        const shown = content.split(/\r?\n/).slice(0, PREVIEW_LINES / 2);
        const lines = lineCount(content);
        return {
          ok: true,
          proposal: {
            tool: "write_file",
            risk: "write",
            operation: "Create file",
            relative: target.relative,
          touches: [target.relative],
            facts: [`New file, ${plural(lines, "line")}.`],
            preview: content === "" ? [] : shown.map((line) => ({ sign: "+", text: previewText(line) })),
            previewCut: lines > shown.length,
            apply: async () => {
              if (!stillThere()) return lost(call, "The path changed while PawOS was waiting for your answer, so nothing was written.");
              await fs.promises.mkdir(path.dirname(target.absolute), { recursive: true });
              // The folders now exist: check once more that the file lands inside the project, then
              // create it — and only create it. If something appeared there meanwhile, nothing is replaced.
              if (!stillThere()) return lost(call, "The path changed while PawOS was waiting for your answer, so nothing was written.");
              await fs.promises.writeFile(target.absolute, content, { encoding: "utf8", flag: "wx" });
              return done(call, `Created ${target.relative} (${plural(lines, "line")}).`);
            },
          },
        };
      }
      const current = await readText(target.absolute);
      if (!current.ok) return failed(call, current.reason);
      if (current.text === content) return failed(call, `${target.relative} already has exactly that content. Nothing to change.`);
      const diff = boundedDiff(current.text, content);
      return {
        ok: true,
        proposal: {
          tool: "write_file",
          risk: "write",
          operation: "Replace file",
          relative: target.relative,
          touches: [target.relative],
          facts: [`Existing file: its whole content is replaced (${plural(lineCount(current.text), "line")} now, ${plural(lineCount(content), "line")} after).`, `From line ${diff.startLine}: ${plural(diff.removed, "line")} removed, ${diff.added.toLocaleString("en-US")} added.`],
          preview: diff.lines,
          previewCut: diff.cut,
          apply: async () => {
            if (!stillThere()) return lost(call, MOVED);
            const now = await readText(target.absolute);
            if (!now.ok || now.text !== current.text) return lost(call, MOVED);
            await fs.promises.writeFile(target.absolute, content, { encoding: "utf8", flag: "r+" }).then(() => fs.promises.truncate(target.absolute, Buffer.byteLength(content, "utf8")));
            return done(call, `Replaced ${target.relative} (${plural(lineCount(content), "line")}).`);
          },
        },
      };
    }

    if (call.name === "edit_file") {
      if (!target.exists) return failed(call, `[edit_no_file] ${target.relative} doesn't exist. Use write_file to create it.`);
      let oldText = text("oldText");
      let newText = text("newText");
      if (oldText === "") return failed(call, "[edit_malformed] The edit names no text to replace.");
      if (oldText === newText) return failed(call, "[edit_malformed] The edit replaces text with the same text. Nothing would change.");
      const current = await readText(target.absolute);
      if (!current.ok) return failed(call, current.reason);
      // A file with Windows line endings is matched as it is: the edit's line breaks follow the file's.
      if (!current.text.includes(oldText) && current.text.includes("\r\n")) {
        oldText = oldText.replace(/\r?\n/g, "\r\n");
        newText = newText.replace(/\r?\n/g, "\r\n");
      }
      const matches = current.text.split(oldText).length - 1;
      if (matches === 0) return failed(call, `[edit_not_found] The text to replace is not in ${target.relative} as it is now. Read the file again and use its exact current text.`);
      const all = call.args.replaceAll === true;
      if (matches > 1 && !all) return failed(call, `[edit_ambiguous] That text appears ${matches} times in ${target.relative}. Include more of the surrounding lines so it matches once, or set replaceAll.`);
      // Spliced in as text: nothing in the replacement is treated as a pattern.
      const at = current.text.indexOf(oldText);
      const after = all ? current.text.split(oldText).join(newText) : `${current.text.slice(0, at)}${newText}${current.text.slice(at + oldText.length)}`;
      if (tooLarge(after)) return failed(call, TOO_LARGE);
      const diff = boundedDiff(current.text, after);
      return {
        ok: true,
        proposal: {
          tool: "edit_file",
          risk: "write",
          operation: "Edit file",
          relative: target.relative,
          touches: [target.relative],
          facts: [`Existing file, ${plural(all ? matches : 1, "replacement")}. From line ${diff.startLine}: ${plural(diff.removed, "line")} removed, ${diff.added.toLocaleString("en-US")} added.`],
          preview: diff.lines,
          previewCut: diff.cut,
          apply: async () => {
            if (!stillThere()) return lost(call, MOVED);
            const now = await readText(target.absolute);
            if (!now.ok || now.text !== current.text) return lost(call, `[edit_conflict] ${MOVED}`);
            await fs.promises.writeFile(target.absolute, after, { encoding: "utf8", flag: "r+" }).then(() => fs.promises.truncate(target.absolute, Buffer.byteLength(after, "utf8")));
            return done(call, `Edited ${target.relative}: ${plural(all ? matches : 1, "replacement")} (${plural(diff.removed, "line")} removed, ${diff.added.toLocaleString("en-US")} added).`);
          },
        },
      };
    }

    // delete_path
    if (!target.exists) return failed(call, `${target.relative} doesn't exist.`);
    const stat = await fs.promises.lstat(target.absolute);
    if (stat.isFile()) {
      return {
        ok: true,
        proposal: {
          tool: "delete_path",
          risk: "delete",
          operation: "Delete file",
          relative: target.relative,
          touches: [target.relative],
          facts: [`One file, ${Math.max(1, Math.round(stat.size / 1000)).toLocaleString("en-US")} KB. It is removed from this computer, not moved to the bin.`],
          preview: [],
          previewCut: false,
          apply: async () => {
            if (!stillThere()) return lost(call, "The path changed while PawOS was waiting for your answer, so nothing was deleted.");
            const now = await fs.promises.lstat(target.absolute).catch(() => null);
            if (!now?.isFile()) return lost(call, "That is no longer a file, so nothing was deleted.");
            await fs.promises.unlink(target.absolute);
            return done(call, `Deleted ${target.relative}.`);
          },
        },
      };
    }
    if (!stat.isDirectory()) return denied(call, "it is not a file or a folder.");
    const held = await contents(workspace, target.absolute, forbidden);
    if (!held.ok) return denied(call, held.reason);
    return {
      ok: true,
      proposal: {
        tool: "delete_path",
        risk: "delete",
        operation: "Delete folder",
        relative: target.relative,
        touches: held.files,
        facts: [`A folder holding ${plural(held.files.length, "file")}${held.folders > 0 ? ` in ${plural(held.folders, "folder")}` : ""}. Everything in it is removed from this computer, not moved to the bin.`],
        preview: held.files.slice(0, DELETE_NAMES_SHOWN).map((file) => ({ sign: "-", text: previewText(file) })),
        previewCut: held.files.length > DELETE_NAMES_SHOWN,
        apply: async () => {
          if (!stillThere()) return lost(call, "The path changed while PawOS was waiting for your answer, so nothing was deleted.");
          // What the folder holds is looked at again: nothing protected may have arrived in it.
          const now = await contents(workspace, target.absolute, forbidden);
          if (!now.ok) return { id: call.id, ok: false, denied: true, output: `Not allowed: ${now.reason}` };
          if (now.files.length !== held.files.length) return lost(call, "The folder changed while PawOS was waiting for your answer, so nothing was deleted.");
          // Links inside are removed as links; what they point at is never followed or touched.
          await fs.promises.rm(target.absolute, { recursive: true, force: false });
          return done(call, `Deleted the folder ${target.relative} (${plural(held.files.length, "file")}).`);
        },
      },
    };
  } catch (error) {
    // PawOS's own wording: an operating-system error can carry the full path on this computer.
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "EEXIST") return failed(call, "A file appeared there in the meantime, so nothing was written.");
    return failed(call, code === "EACCES" || code === "EPERM" ? "This computer didn't allow that change." : "PawOS couldn't make that change.");
  }
}

type Held = { ok: true; files: string[]; folders: number } | { ok: false; reason: string };

/**
 * Everything inside a folder that is about to be deleted. The folder is refused if it holds
 * anything PawOS never deletes — secrets, Git's data, installed or generated code, PawOS's own
 * data — or more than can be shown and checked. Links are listed, never followed.
 */
async function contents(workspace: Workspace, directory: string, forbidden: string[]): Promise<Held> {
  const files: string[] = [];
  let folders = 0;
  const queue = [directory];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(workspace.root, absolute).split(path.sep).join("/");
      if (protectedReason(relative)) return { ok: false, reason: `it holds ${relative}, which PawOS never deletes.` };
      if (forbidden.some((kept) => !path.relative(absolute, kept).startsWith("..") && !path.isAbsolute(path.relative(absolute, kept)))) return { ok: false, reason: "it holds PawOS's own data." };
      if (files.length + folders >= DELETE_ENTRIES) return { ok: false, reason: `it holds more than ${DELETE_ENTRIES.toLocaleString("en-US")} files and folders. Delete something smaller, or remove it yourself.` };
      if (entry.isDirectory()) {
        folders += 1;
        queue.push(absolute);
      } else files.push(relative);
    }
  }
  return { ok: true, files, folders };
}

/** Runs `apply`, turning anything the file system throws into a result in PawOS's own words. */
export async function applyChange(call: ToolCall, proposal: Proposal): Promise<ToolResult> {
  try {
    return await proposal.apply();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === "EEXIST") return lost(call, "A file appeared there in the meantime, so nothing was written.");
    return lost(call, code === "EACCES" || code === "EPERM" || code === "EBUSY" ? "This computer didn't allow that change. Nothing else was touched." : "PawOS couldn't make that change.");
  }
}
