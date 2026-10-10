import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentTurnRequest, AgentTurnResponse, ToolCall } from "../shared";
import { runLocalTask } from "./agent";
import { CHECKPOINT_LIMITS, TaskCheckpoint, applyRestore, checkpointsDirectory, latestCheckpoint, planRestore, stateOf, type CheckpointManifest } from "./checkpoint";
import { openWorkspace, type Workspace } from "./workspace";

/**
 * The recovery checkpoint: what a PawOS task changed, kept so it can be taken back. The project
 * here is a plain folder with no Git repository in it — a checkpoint never depends on Git. PawOS's
 * own folder is beside the project, never inside it.
 */
let outer: string;
let root: string;
let state: string;
let workspace: Workspace;

const SECRET = "s3cr3t-value-0123456789";
const CART = "export const total = 1;\n";
const write = (relative: string, content: string | Buffer, base = root) => {
  const file = path.join(base, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const call = (name: string, args: Record<string, string | number | boolean | string[]> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
const tool = (asked: ToolCall): AgentTurnResponse => ({ turn: { kind: "tool", call: asked, note: null }, turnsLeft: 10 });
const finish: AgentTurnResponse = { turn: { kind: "finish", summary: "Done." }, turnsLeft: 0 };
let taskNumber = 0;

/** Runs one scripted task that changes files, every change approved. */
async function task(steps: ToolCall[], options: { stateDirectory?: string | undefined; goal?: string } = {}) {
  const turns = [...steps.map((asked, index) => tool({ ...asked, id: `step-${index + 1}` })), finish];
  const sent: AgentTurnRequest[] = [];
  taskNumber += 1;
  const outcome = await runLocalTask({
    client: { agentTurn: async (body) => (sent.push(body), turns.shift()!) },
    workspace,
    branch: null,
    taskId: `00000000-0000-4000-8000-${String(taskNumber).padStart(12, "0")}`,
    goal: options.goal ?? "Tidy the shop",
    stateDirectory: "stateDirectory" in options ? options.stateDirectory : state,
    forbidden: [state],
    approve: async () => "allow",
  });
  return { outcome, results: sent.slice(1).map((body) => ("result" in body ? body.result : null)!) };
}
const found = () => latestCheckpoint(state, workspace)!;
const everyStoredByte = () =>
  fs
    .readdirSync(state, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "latin1"))
    .join("\n");

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-checkpoint-")));
  root = path.join(outer, "shop");
  state = path.join(outer, "pawos-state");
  fs.mkdirSync(root);
  fs.mkdirSync(state);
  write("src/cart.ts", CART);
  write("src/old/legacy.ts", "export const legacy = true;\n");
  write("src/old/notes.md", "- remove legacy\n");
  write("README.md", "# Shop\n");
  write("untouched.txt", "this file is never changed by a task\n");
  write(".env", `API_KEY=${SECRET}\n`);
  write("../outside.txt", "OUTSIDE\n");
  workspace = openWorkspace(root)!;
});

afterEach(() => fs.rmSync(outer, { recursive: true, force: true }));

describe("a checkpoint is made at a task's first change to a file", () => {
  it("a task that only reads keeps nothing", async () => {
    await task([call("read_file", { path: "README.md" }), call("list_files")]);
    expect(fs.existsSync(checkpointsDirectory(state))).toBe(false);
    expect(latestCheckpoint(state, workspace)).toBeNull();
  });

  it("keeps what each changed file was, outside the project, and nothing else", async () => {
    const { outcome } = await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" }), call("write_file", { path: "src/new.ts", content: "export {};\n" }), call("delete_path", { path: "README.md" })]);
    expect(outcome.steps.map((step) => step.change?.recoverable)).toEqual([true, true, true]);
    const { directory, manifest } = found();
    // Outside the project: in PawOS's own folder.
    expect(path.relative(root, directory).startsWith("..")).toBe(true);
    expect(path.relative(state, directory).startsWith("..")).toBe(false);
    expect(fs.readdirSync(root).sort()).toEqual([".env", "src", "untouched.txt"]);
    expect(manifest).toMatchObject({ version: 1, workspaceRoot: workspace.root, workspaceName: "shop", goal: "Tidy the shop", restoredAt: null });
    expect(manifest.entries.map((entry) => [entry.relative, entry.before.kind, entry.after?.kind])).toEqual([["src/cart.ts", "file", "file"], ["src/new.ts", "absent", "file"], ["README.md", "file", "absent"]]);
    // Two files existed before: two copies. Not the project.
    const copies = fs.readdirSync(directory).filter((name) => name.endsWith(".bin"));
    expect(copies).toHaveLength(2);
    expect(copies.map((name) => fs.readFileSync(path.join(directory, name), "utf8")).sort()).toEqual(["# Shop\n", CART].sort());
    expect(everyStoredByte()).not.toContain("this file is never changed by a task");
    expect(everyStoredByte()).not.toContain("legacy");
  });

  it("it is the file as it was when the task began: a second change to it doesn't replace the copy", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" }), call("edit_file", { path: "src/cart.ts", oldText: "= 2", newText: "= 3" }), call("write_file", { path: "src/cart.ts", content: "export const total = 4;\n" })]);
    expect(read("src/cart.ts")).toBe("export const total = 4;\n");
    expect(found().manifest.entries).toHaveLength(1);
    expect(applyRestore(found(), workspace).restored.map((item) => item.relative)).toEqual(["src/cart.ts"]);
    expect(read("src/cart.ts")).toBe(CART);
  });

  it("does not capture protected secrets: not in a checkpoint a task makes, and not if asked directly", async () => {
    await task([call("write_file", { path: ".env", content: "API_KEY=changed" }), call("delete_path", { path: ".env" }), call("edit_file", { path: ".env", oldText: SECRET, newText: "x" }), call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    expect(read(".env")).toBe(`API_KEY=${SECRET}\n`);
    expect(everyStoredByte()).not.toContain(SECRET);
    expect(found().manifest.entries.map((entry) => entry.relative)).toEqual(["src/cart.ts"]);
    const checkpoint = TaskCheckpoint.begin(state, "direct-0001", workspace, "x")!;
    for (const secret of [".env", "config/server.pem", "apps/api/.env.local", ".npmrc", ".git/config", "node_modules/x/index.js"]) {
      expect(checkpoint.capture([secret]), secret).toEqual({ ok: false, reason: "a protected file is never copied." });
    }
    expect(checkpoint.capture(["README.md", ".env"])).toMatchObject({ ok: false });
    expect(checkpoint.manifest.entries).toEqual([]);
    expect(everyStoredByte()).not.toContain(SECRET);
  });

  it("is never kept inside the project it protects; the change is still made, and said to have no copy", async () => {
    const inside = path.join(root, "pawos-data");
    fs.mkdirSync(inside);
    expect(TaskCheckpoint.begin(inside, "inside-0001", workspace, "x")).toBeNull();
    expect(TaskCheckpoint.begin(undefined, "none-00001", workspace, "x")).toBeNull();
    const { outcome } = await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })], { stateDirectory: undefined });
    expect(read("src/cart.ts")).toBe("export const total = 2;\n");
    expect(outcome.steps[0]!.change).toEqual({ operation: "Edit file", relative: "src/cart.ts", recoverable: false });
    expect(fs.existsSync(path.join(inside, "checkpoints"))).toBe(false);
  });

  it("is bounded: a change it can't keep a copy for is not made", async () => {
    write("huge.bin", Buffer.alloc(CHECKPOINT_LIMITS.fileBytes + 1, 1));
    const { results } = await task([call("delete_path", { path: "huge.bin" })]);
    expect(results[0]).toMatchObject({ ok: false, output: "PawOS did not make this change, because it could not keep a recovery copy first: huge.bin is too large to keep a copy of." });
    expect(exists("huge.bin")).toBe(true);
    const checkpoint = TaskCheckpoint.begin(state, "bounds-0001", workspace, "x")!;
    expect(checkpoint.capture(Array.from({ length: CHECKPOINT_LIMITS.files + 1 }, (_, index) => `f${index}.ts`))).toMatchObject({ ok: false });
    expect(CHECKPOINT_LIMITS).toMatchObject({ files: 2500, fileBytes: 5_000_000, totalBytes: 50_000_000, kept: 5 });
  });

  it("only the newest few are kept", async () => {
    for (let index = 0; index < CHECKPOINT_LIMITS.kept + 3; index++) {
      await task([call("write_file", { path: `gen/file-${index}.ts`, content: `export const n = ${index};\n` })], { goal: `Task ${index}` });
      // A distinct time for each, so "newest" is not a tie.
      const directories = fs.readdirSync(checkpointsDirectory(state));
      const newest = path.join(checkpointsDirectory(state), directories.sort().at(-1)!, "manifest.json");
      fs.utimesSync(newest, new Date(2026, 0, 1, 0, index), new Date(2026, 0, 1, 0, index));
    }
    expect(fs.readdirSync(checkpointsDirectory(state))).toHaveLength(CHECKPOINT_LIMITS.kept);
  });
});

describe("restoring", () => {
  it("restores a modified file", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    expect(planRestore(found(), workspace)).toEqual({ refused: null, items: [{ relative: "src/cart.ts", action: "restore", why: null }] });
    expect(read("src/cart.ts")).toBe("export const total = 2;\n"); // planning touched nothing
    expect(applyRestore(found(), workspace)).toEqual({ restored: [{ relative: "src/cart.ts", action: "restore", why: null }], skipped: [] });
    expect(read("src/cart.ts")).toBe(CART);
  });

  it("restores a deleted file, and a deleted folder with everything that was in it", async () => {
    await task([call("delete_path", { path: "README.md" }), call("delete_path", { path: "src/old" })]);
    expect(exists("README.md")).toBe(false);
    expect(exists("src/old")).toBe(false);
    expect(planRestore(found(), workspace).items.map((item) => [item.relative, item.action])).toEqual([["README.md", "recreate"], ["src/old/legacy.ts", "recreate"], ["src/old/notes.md", "recreate"]]);
    expect(applyRestore(found(), workspace).restored).toHaveLength(3);
    expect(read("README.md")).toBe("# Shop\n");
    expect(read("src/old/legacy.ts")).toBe("export const legacy = true;\n");
    expect(read("src/old/notes.md")).toBe("- remove legacy\n");
  });

  it("removes a file PawOS created", async () => {
    await task([call("write_file", { path: "src/pricing/tax.ts", content: "export const tax = 0.2;\n" })]);
    expect(planRestore(found(), workspace).items).toEqual([{ relative: "src/pricing/tax.ts", action: "remove", why: null }]);
    applyRestore(found(), workspace);
    expect(exists("src/pricing/tax.ts")).toBe(false);
  });

  it("handles untracked files: the project here has no Git repository at all", async () => {
    expect(exists(".git")).toBe(false);
    write("scratch/notes.txt", "my untracked notes\n");
    await task([call("edit_file", { path: "scratch/notes.txt", oldText: "untracked", newText: "REWRITTEN" }), call("delete_path", { path: "untouched.txt" }), call("write_file", { path: "scratch/new.txt", content: "new\n" })]);
    const outcome = applyRestore(found(), workspace);
    expect(outcome.restored.map((item) => [item.relative, item.action])).toEqual([["scratch/notes.txt", "restore"], ["untouched.txt", "recreate"], ["scratch/new.txt", "remove"]]);
    expect(read("scratch/notes.txt")).toBe("my untracked notes\n");
    expect(read("untouched.txt")).toBe("this file is never changed by a task\n");
    expect(exists("scratch/new.txt")).toBe(false);
  });

  it("restores bytes exactly, whatever the file's line endings", async () => {
    write("win.txt", "one\r\ntwo\r\n");
    await task([call("edit_file", { path: "win.txt", oldText: "one", newText: "1" })]);
    applyRestore(found(), workspace);
    expect(fs.readFileSync(path.join(root, "win.txt")).equals(Buffer.from("one\r\ntwo\r\n"))).toBe(true);
  });

  it("a restore conflict is detected: a file changed after PawOS changed it is left alone", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" }), call("edit_file", { path: "README.md", oldText: "Shop", newText: "Store" })]);
    write("src/cart.ts", "export const total = 2;\n// my own fix, made after PawOS\n");
    const plan = planRestore(found(), workspace);
    expect(plan.items).toEqual([{ relative: "src/cart.ts", action: "conflict", why: "It has changed since PawOS changed it." }, { relative: "README.md", action: "restore", why: null }]);
    const outcome = applyRestore(found(), workspace);
    expect(outcome.restored.map((item) => item.relative)).toEqual(["README.md"]);
    expect(outcome.skipped).toEqual([{ relative: "src/cart.ts", action: "conflict", why: "It has changed since PawOS changed it." }]);
    // The user's newer work is exactly as they left it.
    expect(read("src/cart.ts")).toBe("export const total = 2;\n// my own fix, made after PawOS\n");
    expect(read("README.md")).toBe("# Shop\n");
  });

  it("user changes after PawOS are never overwritten, whatever kind of change PawOS made", async () => {
    await task([call("write_file", { path: "created.ts", content: "by pawos\n" }), call("delete_path", { path: "README.md" }), call("delete_path", { path: "untouched.txt" }), call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    write("created.ts", "by pawos\nand then by me\n"); // the user built on the file PawOS created
    write("README.md", "# My new readme\n"); // the user wrote a new file where PawOS deleted one
    fs.rmSync(path.join(root, "src", "cart.ts")); // the user removed the file PawOS edited
    const outcome = applyRestore(found(), workspace);
    expect(outcome.restored.map((item) => item.relative)).toEqual(["untouched.txt"]);
    expect(outcome.skipped.map((item) => [item.relative, item.action, item.why])).toEqual([
      ["created.ts", "conflict", "It has changed since PawOS changed it."],
      ["README.md", "conflict", "It has changed since PawOS changed it."],
      ["src/cart.ts", "conflict", "It has been removed since PawOS changed it."],
    ]);
    expect(read("created.ts")).toBe("by pawos\nand then by me\n");
    expect(read("README.md")).toBe("# My new readme\n");
    expect(exists("src/cart.ts")).toBe(false);
  });

  it("a file the user edits while the question is open is still theirs", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    const checkpoint = found();
    expect(planRestore(checkpoint, workspace).items[0]!.action).toBe("restore"); // what the user was shown
    write("src/cart.ts", "edited in that moment\n");
    expect(applyRestore(checkpoint, workspace)).toMatchObject({ restored: [], skipped: [{ relative: "src/cart.ts", action: "conflict" }] });
    expect(read("src/cart.ts")).toBe("edited in that moment\n");
  });

  it("a file the user has already put back is left as it is", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    write("src/cart.ts", CART);
    expect(planRestore(found() ?? latestCheckpoint(state, workspace)!, workspace).items).toEqual([{ relative: "src/cart.ts", action: "unchanged", why: null }]);
  });

  it("once used, a checkpoint is not offered again; the one before it is", async () => {
    await task([call("edit_file", { path: "README.md", oldText: "Shop", newText: "Store" })], { goal: "First task" });
    const first = path.join(found().directory, "manifest.json");
    fs.utimesSync(first, new Date(2026, 0, 1), new Date(2026, 0, 1));
    const older = JSON.parse(fs.readFileSync(first, "utf8")) as CheckpointManifest;
    fs.writeFileSync(first, JSON.stringify({ ...older, createdAt: "2026-01-01T00:00:00.000Z" }));
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })], { goal: "Second task" });
    expect(found().manifest.goal).toBe("Second task");
    applyRestore(found(), workspace);
    expect(found().manifest.goal).toBe("First task");
    applyRestore(found(), workspace);
    expect(latestCheckpoint(state, workspace)).toBeNull();
    expect(read("README.md")).toBe("# Shop\n");
    expect(read("src/cart.ts")).toBe(CART);
  });
});

describe("restoring is never blind", () => {
  it("verifies the project is still there, and is the one the changes were made in", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    const checkpoint = found();
    const elsewhere = path.join(outer, "other-project");
    fs.mkdirSync(path.join(elsewhere, "src"), { recursive: true });
    fs.writeFileSync(path.join(elsewhere, "src", "cart.ts"), "export const total = 2;\n");
    const other = openWorkspace(elsewhere)!;
    expect(latestCheckpoint(state, other)).toBeNull();
    expect(planRestore(checkpoint, other)).toEqual({ refused: "These changes were made in a different project.", items: [] });
    expect(applyRestore(checkpoint, other).restored).toEqual([]);
    expect(fs.readFileSync(path.join(elsewhere, "src", "cart.ts"), "utf8")).toBe("export const total = 2;\n");
    fs.rmSync(root, { recursive: true, force: true });
    expect(planRestore(checkpoint, workspace)).toEqual({ refused: "The project these changes were made in is no longer there.", items: [] });
    expect(applyRestore(checkpoint, workspace).restored).toEqual([]);
    expect(fs.existsSync(root)).toBe(false); // nothing was recreated
  });

  it("verifies each path stays inside the project and is not protected, even if the checkpoint has been altered", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    const checkpoint = found();
    const real = checkpoint.manifest.entries[0]!;
    const present = stateOf(path.join(outer, "outside.txt"));
    const secretNow = stateOf(path.join(root, ".env"));
    checkpoint.manifest.entries = [
      { ...real, relative: "../outside.txt", after: present },
      { ...real, relative: path.join(outer, "outside.txt"), after: present },
      { ...real, relative: ".env", after: secretNow },
      { ...real, relative: ".git/config", after: { kind: "absent" } },
      { ...real, relative: "node_modules/x.js", after: { kind: "absent" } },
      { ...real, relative: "", after: { kind: "absent" } },
    ];
    const plan = planRestore(checkpoint, workspace, [state]);
    expect(plan.items.map((item) => item.action)).toEqual(["refused", "refused", "refused", "refused", "refused", "refused"]);
    expect(applyRestore(checkpoint, workspace, [state]).restored).toEqual([]);
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("OUTSIDE\n");
    expect(read(".env")).toBe(`API_KEY=${SECRET}\n`);
    expect(exists(".git")).toBe(false);
  });

  it("does not restore through a link that has taken a file's place", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    fs.rmSync(path.join(root, "src", "cart.ts"));
    try {
      fs.symlinkSync(path.join(outer, "outside.txt"), path.join(root, "src", "cart.ts"), "file");
    } catch {
      return; // this computer won't make a link for a test
    }
    expect(applyRestore(found(), workspace).restored).toEqual([]);
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("OUTSIDE\n");
  });

  it("a copy that is missing or damaged is not used", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" }), call("edit_file", { path: "README.md", oldText: "Shop", newText: "Store" })]);
    const checkpoint = found();
    const [cart, readme] = checkpoint.manifest.entries;
    fs.writeFileSync(path.join(checkpoint.directory, cart!.blob!), "tampered contents");
    fs.rmSync(path.join(checkpoint.directory, readme!.blob!));
    expect(planRestore(checkpoint, workspace).items).toEqual([{ relative: "src/cart.ts", action: "refused", why: "Its copy is damaged." }, { relative: "README.md", action: "refused", why: "Its copy is missing." }]);
    expect(applyRestore(checkpoint, workspace).restored).toEqual([]);
    expect(read("src/cart.ts")).toBe("export const total = 2;\n");
  });

  it("a checkpoint whose record isn't in the expected shape is not offered at all", async () => {
    await task([call("edit_file", { path: "src/cart.ts", oldText: "= 1", newText: "= 2" })]);
    const file = path.join(found().directory, "manifest.json");
    const good = JSON.parse(fs.readFileSync(file, "utf8")) as CheckpointManifest;
    for (const bad of [{ ...good, version: 2 }, { ...good, entries: "none" }, { ...good, entries: [{ ...good.entries[0], blob: "../../../outside.txt" }] }, { ...good, entries: [{ ...good.entries[0], blob: "C:\\Windows\\win.ini" }] }, { ...good, entries: [{ ...good.entries[0], before: { kind: "file", sha256: "nope" } }] }, "not json"]) {
      fs.writeFileSync(file, typeof bad === "string" ? bad : JSON.stringify(bad));
      expect(latestCheckpoint(state, workspace)).toBeNull();
    }
  });
});
