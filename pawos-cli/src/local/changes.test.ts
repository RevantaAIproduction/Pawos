import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_CLIENT_LIMITS, type AgentTurnRequest, type AgentTurnResponse, type ToolCall } from "../shared";
import { DECLINED, runLocalTask } from "./agent";
import { DELETE_ENTRIES, PREVIEW_LINES, applyChange, boundedDiff, prepareChange, previewText, type Proposal } from "./changes";
import { executeTool } from "./tools";
import { openWorkspace, resolveForChange, type Workspace } from "./workspace";

// Many real files on Windows takes seconds per test, more under a full parallel run: the 5-second default is too tight.
vi.setConfig({ testTimeout: 30_000 });

/**
 * The tools that change the project: write_file, edit_file and delete_path. Run in a throwaway
 * folder made for the test. A change is prepared (nothing touched), shown, and applied only after
 * approval — these tests hold each of those steps, and the boundary around all of them.
 */
let outer: string;
let root: string;
let state: string;
let workspace: Workspace;

const CART = "export function total(items: number[]) {\n  return items.reduce((a, b) => a + b, 0);\n}\n";
const write = (relative: string, content: string | Buffer, base = root) => {
  const file = path.join(base, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string, base = root) => fs.existsSync(path.join(base, relative));
const call = (name: string, args: Record<string, string | number | boolean> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
const prepare = (name: string, args: Record<string, string | number | boolean>) => prepareChange(call(name, args), workspace, { forbidden: [state] });
/** Prepares a change that must be allowed, and hands back its proposal. */
async function proposed(name: string, args: Record<string, string | number | boolean>): Promise<Proposal> {
  const prepared = await prepare(name, args);
  if (!prepared.ok) throw new Error(`refused: ${prepared.result.output}`);
  return prepared.proposal;
}
/** Prepares a change that must be refused, and hands back the result the service would be sent. */
async function refused(name: string, args: Record<string, string | number | boolean>) {
  const prepared = await prepare(name, args);
  if (prepared.ok) throw new Error(`allowed: ${prepared.proposal.operation} ${prepared.proposal.relative}`);
  return prepared.result;
}
function link(target: string, at: string, kind: "file" | "dir"): boolean {
  try {
    fs.symlinkSync(target, at, kind === "dir" && process.platform === "win32" ? "junction" : kind);
    return true;
  } catch {
    return false;
  }
}
/** Every file under a folder with its contents: to show that nothing at all changed. */
function snapshot(base: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const file = path.join(entry.parentPath, entry.name);
      found[path.relative(base, file)] = fs.readFileSync(file, "utf8");
    }
  }
  return found;
}

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-changes-")));
  root = path.join(outer, "shop");
  state = path.join(root, ".pawos-state");
  fs.mkdirSync(root);
  write("src/cart.ts", CART);
  write("src/old/legacy.ts", "export const legacy = true;\n");
  write("src/old/notes/todo.md", "- remove legacy\n");
  write("README.md", "# Shop\n");
  write(".env", "API_KEY=sk-live-very-secret\n");
  write("config/server.pem", "-----BEGIN PRIVATE KEY-----\n");
  write("apps/api/.env", "DB=secret\n");
  write("apps/api/index.ts", "export {};\n");
  write("packages/web/node_modules/x/index.js", "x\n");
  write("packages/web/index.ts", "export {};\n");
  write("node_modules/left-pad/index.js", "module.exports = 1;\n");
  write("dist/bundle.js", "var a;\n");
  write(".git/config", "[core]\n");
  write(".git/hooks/pre-commit", "#!/bin/sh\n");
  write(".pawos-state/session.json", "{}\n");
  write("../outside.txt", "OUTSIDE\n");
  workspace = openWorkspace(root)!;
});

afterEach(() => fs.rmSync(outer, { recursive: true, force: true }));

describe("write_file", () => {
  it("creates a file: nothing exists until the change is applied", async () => {
    const proposal = await proposed("write_file", { path: "src/discount.ts", content: "export const rate = 0.1;\nexport const cap = 50;\n" });
    expect(proposal).toMatchObject({ tool: "write_file", risk: "write", operation: "Create file", relative: "src/discount.ts", facts: ["New file, 2 lines."], previewCut: false });
    expect(proposal.preview).toEqual([{ sign: "+", text: "export const rate = 0.1;" }, { sign: "+", text: "export const cap = 50;" }, { sign: "+", text: "" }]);
    expect(exists("src/discount.ts")).toBe(false);
    expect(await proposal.apply()).toEqual({ id: "step-1", ok: true, output: "Created src/discount.ts (2 lines)." });
    expect(read("src/discount.ts")).toBe("export const rate = 0.1;\nexport const cap = 50;\n");
  });

  it("creates the folders it needs, inside the project only", async () => {
    const proposal = await proposed("write_file", { path: "src/pricing/rules/tax.ts", content: "export const tax = 0.2;\n" });
    expect(exists("src/pricing")).toBe(false); // preparing made nothing
    await proposal.apply();
    expect(read("src/pricing/rules/tax.ts")).toBe("export const tax = 0.2;\n");
  });

  it("an existing file is a replacement, shown as one, and never done by the create path", async () => {
    const proposal = await proposed("write_file", { path: "README.md", content: "# Shop\n\nA small shop.\n" });
    expect(proposal.operation).toBe("Replace file");
    expect(proposal.facts[0]).toBe("Existing file: its whole content is replaced (1 line now, 3 lines after).");
    expect(proposal.preview).toContainEqual({ sign: "+", text: "A small shop." });
    expect(read("README.md")).toBe("# Shop\n");
    expect((await proposal.apply()).output).toBe("Replaced README.md (3 lines).");
    expect(read("README.md")).toBe("# Shop\n\nA small shop.\n");
  });

  it("a replacement that is shorter leaves nothing of the old file behind", async () => {
    write("long.txt", "a".repeat(5000));
    await (await proposed("write_file", { path: "long.txt", content: "short\n" })).apply();
    expect(read("long.txt")).toBe("short\n");
  });

  it("a file that appears after the user was shown 'new file' is not overwritten", async () => {
    const proposal = await proposed("write_file", { path: "src/new.ts", content: "mine\n" });
    write("src/new.ts", "someone else's work\n");
    const result = await applyChange(call("write_file"), proposal);
    expect(result.ok).toBe(false);
    expect(read("src/new.ts")).toBe("someone else's work\n");
  });

  it("an existing file that changed since it was shown is not replaced", async () => {
    const proposal = await proposed("write_file", { path: "README.md", content: "# New\n" });
    write("README.md", "# Edited by hand meanwhile\n");
    const result = await proposal.apply();
    expect(result).toMatchObject({ ok: false, output: expect.stringMatching(/changed while PawOS was waiting/) });
    expect(read("README.md")).toBe("# Edited by hand meanwhile\n");
  });

  it("writing what is already there is not a change", async () => {
    expect(await refused("write_file", { path: "README.md", content: "# Shop\n" })).toMatchObject({ ok: false, output: "README.md already has exactly that content. Nothing to change." });
  });

  it("an oversized file is refused", async () => {
    const before = snapshot(outer);
    const result = await refused("write_file", { path: "big.txt", content: "a".repeat(AGENT_CLIENT_LIMITS.fileBytes + 1) });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/larger than PawOS writes/);
    expect(result.output.length).toBeLessThan(200);
    // Counted in bytes, not characters.
    expect((await refused("write_file", { path: "wide.txt", content: "€".repeat(AGENT_CLIENT_LIMITS.fileBytes / 2) })).output).toMatch(/larger than PawOS writes/);
    expect(snapshot(outer)).toEqual(before);
  });

  it("only text is written, and a folder or a file PawOS can't read is not replaced", async () => {
    expect((await refused("write_file", { path: "logo.bin", content: "a\0b" })).output).toBe("PawOS writes text files only.");
    expect((await refused("write_file", { path: "src", content: "x" })).output).toBe("That is not a file.");
    write("image.png", Buffer.from([0x89, 0x50, 0, 0, 1]));
    expect((await refused("write_file", { path: "image.png", content: "x" })).output).toBe("That file isn't text.");
    write("huge.txt", "a".repeat(AGENT_CLIENT_LIMITS.fileBytes + 10));
    expect((await refused("write_file", { path: "huge.txt", content: "x" })).output).toMatch(/too large to change/);
  });
});

describe("edit_file", () => {
  it("replaces exact text, and shows the difference before anything is written", async () => {
    const proposal = await proposed("edit_file", { path: "src/cart.ts", oldText: "  return items.reduce((a, b) => a + b, 0);", newText: "  const sum = items.reduce((a, b) => a + b, 0);\n  return Math.max(0, sum);" });
    expect(proposal).toMatchObject({ tool: "edit_file", risk: "write", operation: "Edit file", relative: "src/cart.ts", facts: ["Existing file, 1 replacement. From line 2: 1 line removed, 2 added."] });
    expect(proposal.preview).toEqual([
      { sign: " ", text: "export function total(items: number[]) {" },
      { sign: "-", text: "  return items.reduce((a, b) => a + b, 0);" },
      { sign: "+", text: "  const sum = items.reduce((a, b) => a + b, 0);" },
      { sign: "+", text: "  return Math.max(0, sum);" },
      { sign: " ", text: "}" },
    ]);
    expect(read("src/cart.ts")).toBe(CART);
    expect(await proposal.apply()).toEqual({ id: "step-1", ok: true, output: "Edited src/cart.ts: 1 replacement (1 line removed, 2 added)." });
    expect(read("src/cart.ts")).toBe("export function total(items: number[]) {\n  const sum = items.reduce((a, b) => a + b, 0);\n  return Math.max(0, sum);\n}\n");
  });

  it("the replacement is text, never a pattern", async () => {
    write("price.ts", "const label = 'PRICE';\n");
    await (await proposed("edit_file", { path: "price.ts", oldText: "'PRICE'", newText: "'$& $1 $$ cost'" })).apply();
    expect(read("price.ts")).toBe("const label = '$& $1 $$ cost';\n");
    write("re.ts", "a.*b\naxxb\n");
    await (await proposed("edit_file", { path: "re.ts", oldText: "a.*b", newText: "done" })).apply();
    expect(read("re.ts")).toBe("done\naxxb\n");
  });

  it("keeps a file's Windows line endings", async () => {
    write("win.ts", "one\r\ntwo\r\nthree\r\n");
    await (await proposed("edit_file", { path: "win.ts", oldText: "one\ntwo", newText: "one\n2" })).apply();
    expect(read("win.ts")).toBe("one\r\n2\r\nthree\r\n");
  });

  it("a malformed edit is refused with a reason the model can act on", async () => {
    expect((await refused("edit_file", { path: "src/cart.ts", oldText: "", newText: "x" })).output).toBe("[edit_malformed] The edit names no text to replace.");
    expect((await refused("edit_file", { path: "src/cart.ts", oldText: "total", newText: "total" })).output).toBe("[edit_malformed] The edit replaces text with the same text. Nothing would change.");
    expect((await refused("edit_file", { path: "src/cart.ts", newText: "x" })).output).toMatch(/^\[edit_malformed\]/);
    expect((await refused("edit_file", { path: "src/missing.ts", oldText: "a", newText: "b" })).output).toBe("[edit_no_file] src/missing.ts doesn't exist. Use write_file to create it.");
    expect(read("src/cart.ts")).toBe(CART);
  });

  it("an edit that doesn't fit the file as it is now is a failure, not a guess", async () => {
    const missing = await refused("edit_file", { path: "src/cart.ts", oldText: "return items.sum();", newText: "return 0;" });
    expect(missing).toEqual({ id: "step-1", ok: false, output: "[edit_not_found] The text to replace is not in src/cart.ts as it is now. Read the file again and use its exact current text." });
    expect(missing.denied).toBeUndefined(); // a failure to retry, not a refusal
    write("twice.ts", "let a = 1;\nlet b = 1;\n");
    expect((await refused("edit_file", { path: "twice.ts", oldText: "= 1;", newText: "= 2;" })).output).toBe("[edit_ambiguous] That text appears 2 times in twice.ts. Include more of the surrounding lines so it matches once, or set replaceAll.");
    expect(read("twice.ts")).toBe("let a = 1;\nlet b = 1;\n");
    const all = await proposed("edit_file", { path: "twice.ts", oldText: "= 1;", newText: "= 2;", replaceAll: true });
    expect(all.facts[0]).toMatch(/^Existing file, 2 replacements\./);
    await all.apply();
    expect(read("twice.ts")).toBe("let a = 2;\nlet b = 2;\n");
  });

  it("a conflict: the file changed between the question and the answer, so nothing is written", async () => {
    const proposal = await proposed("edit_file", { path: "src/cart.ts", oldText: "a + b", newText: "a - b" });
    write("src/cart.ts", `${CART}// edited by hand\n`);
    const result = await proposal.apply();
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^\[edit_conflict\] The file changed while PawOS was waiting/);
    expect(read("src/cart.ts")).toBe(`${CART}// edited by hand\n`);
  });

  it("an edit that would make the file oversized is refused", async () => {
    expect((await refused("edit_file", { path: "README.md", oldText: "Shop", newText: "S".repeat(AGENT_CLIENT_LIMITS.fileBytes) })).output).toMatch(/larger than PawOS writes/);
    expect(read("README.md")).toBe("# Shop\n");
  });
});

describe("delete_path", () => {
  it("deletes a file, after saying exactly which", async () => {
    const proposal = await proposed("delete_path", { path: "src/old/legacy.ts" });
    expect(proposal).toMatchObject({ tool: "delete_path", risk: "delete", operation: "Delete file", relative: "src/old/legacy.ts" });
    expect(proposal.facts[0]).toMatch(/^One file, 1 KB\. It is removed from this computer/);
    expect(exists("src/old/legacy.ts")).toBe(true);
    expect(await proposal.apply()).toEqual({ id: "step-1", ok: true, output: "Deleted src/old/legacy.ts." });
    expect(exists("src/old/legacy.ts")).toBe(false);
    expect(exists("src/old/notes/todo.md")).toBe(true);
  });

  it("deletes a folder, listing what it holds", async () => {
    const proposal = await proposed("delete_path", { path: "src/old" });
    expect(proposal.operation).toBe("Delete folder");
    expect(proposal.facts[0]).toBe("A folder holding 2 files in 1 folder. Everything in it is removed from this computer, not moved to the bin.");
    expect(proposal.preview).toEqual([{ sign: "-", text: "src/old/legacy.ts" }, { sign: "-", text: "src/old/notes/todo.md" }]);
    expect((await proposal.apply()).output).toBe("Deleted the folder src/old (2 files).");
    expect(exists("src/old")).toBe(false);
    expect(exists("src/cart.ts")).toBe(true);
  });

  it("a big folder's listing is bounded, and a huge one is not deleted from here", async () => {
    for (let index = 0; index < 30; index++) write(`tmp/f${String(index).padStart(2, "0")}.txt`, "x");
    const proposal = await proposed("delete_path", { path: "tmp" });
    expect(proposal.preview).toHaveLength(12);
    expect(proposal.previewCut).toBe(true);
    for (let index = 0; index < DELETE_ENTRIES + 5; index++) fs.writeFileSync(path.join(root, "tmp", `g${index}.txt`), "");
    expect(await refused("delete_path", { path: "tmp" })).toMatchObject({ denied: true, output: expect.stringMatching(/holds more than 2,000 files and folders/) });
    expect(exists("tmp/f00.txt")).toBe(true);
  });

  it("never the project itself, Git's data, secrets, dependencies, build output or PawOS's own data", async () => {
    const before = snapshot(outer);
    for (const target of ["", ".", "./", "src/..", ".git", ".git/config", ".git/hooks", ".env", "apps/api/.env", "config/server.pem", "node_modules", "node_modules/left-pad", "dist", "dist/bundle.js", ".pawos-state", ".pawos-state/session.json"]) {
      const result = await refused("delete_path", { path: target });
      expect(result, target).toMatchObject({ ok: false, denied: true });
    }
    expect(snapshot(outer)).toEqual(before);
  });

  it("a folder is not deleted if anything protected is inside it", async () => {
    expect((await refused("delete_path", { path: "apps" })).output).toBe("Not allowed: it holds apps/api/.env, which PawOS never deletes.");
    expect((await refused("delete_path", { path: "packages/web" })).output).toBe("Not allowed: it holds packages/web/node_modules, which PawOS never deletes.");
    expect((await refused("delete_path", { path: "config" })).output).toMatch(/holds config\/server\.pem/);
    expect(exists("apps/api/index.ts")).toBe(true);
    expect(exists("packages/web/index.ts")).toBe(true);
  });

  it("something protected that arrives in the folder after the question stops the delete", async () => {
    const proposal = await proposed("delete_path", { path: "src/old" });
    write("src/old/.env", "LATE=secret\n");
    expect(await proposal.apply()).toMatchObject({ ok: false, denied: true });
    expect(exists("src/old/legacy.ts")).toBe(true);
  });

  it("what isn't there can't be deleted", async () => {
    expect(await refused("delete_path", { path: "src/nope.ts" })).toEqual({ id: "step-1", ok: false, output: "src/nope.ts doesn't exist." });
  });
});

describe("the boundary holds for every change", () => {
  const TOOLS: [string, Record<string, string>][] = [
    ["write_file", { content: "pwned\n" }],
    ["edit_file", { oldText: "OUTSIDE", newText: "pwned" }],
    ["delete_path", {}],
  ];

  it.each([
    ["path traversal", "../outside.txt"],
    ["path traversal through a folder", "src/../../outside.txt"],
    ["deep traversal", "src/../../../../../../etc/passwd"],
    ["backslash traversal", "..\\outside.txt"],
    ["an absolute path", "/etc/passwd"],
    ["an absolute path into the project's parent", "ABSOLUTE"],
    ["a Windows drive path", "C:\\Windows\\win.ini"],
    ["a Windows drive path with forward slashes", "C:/Users/Public/x.txt"],
    ["a drive-relative path", "c:x.txt"],
    ["a UNC path", "\\\\server\\share\\x.txt"],
    ["a UNC path with forward slashes", "//server/share/x.txt"],
    ["the home folder", "~/.bashrc"],
    ["the home folder itself", "~"],
  ])("%s is refused by write, edit and delete", async (_label, given) => {
    const target = given === "ABSOLUTE" ? path.join(outer, "outside.txt") : given;
    const before = snapshot(outer);
    for (const [name, args] of TOOLS) {
      const result = await refused(name, { path: target, ...args });
      expect(result, name).toMatchObject({ ok: false, denied: true });
      expect(result.output).not.toContain(outer);
    }
    expect(snapshot(outer)).toEqual(before);
  });

  it("a protected file is refused by write, edit and delete, however it is written", async () => {
    const before = snapshot(outer);
    for (const target of [".env", "./.env", "src/../.env", ".ENV", ".env.production", "apps/api/.env", "config/server.pem", "new-key.pem", "id_rsa", ".npmrc", "secrets.json", "infra/prod.tfvars"]) {
      for (const [name, args] of TOOLS) expect(await refused(name, { path: target, ...args }), `${name} ${target}`).toMatchObject({ ok: false, denied: true });
    }
    expect(snapshot(outer)).toEqual(before);
  });

  it("a protected directory is refused by write, edit and delete", async () => {
    const before = snapshot(outer);
    for (const target of [".git/config", ".git/hooks/pre-commit", ".git/hooks/post-checkout", "node_modules/left-pad/index.js", "node_modules/evil/index.js", "packages/web/node_modules/x/index.js", "dist/bundle.js", "build/out.js", ".next/server.js", ".ssh/authorized_keys", ".aws/credentials", ".pawos-state/session.json", ".pawos-state/new.json"]) {
      for (const [name, args] of TOOLS) expect(await refused(name, { path: target, ...args }), `${name} ${target}`).toMatchObject({ ok: false, denied: true });
    }
    expect(snapshot(outer)).toEqual(before);
    // A Git hook is a program Git would run: it can never be planted.
    expect(exists(".git/hooks/post-checkout")).toBe(false);
  });

  it("symlink escape: a linked folder can't be written into, edited through or deleted through", async () => {
    fs.mkdirSync(path.join(outer, "elsewhere"));
    fs.writeFileSync(path.join(outer, "elsewhere", "private.txt"), "OUTSIDE private\n");
    if (!link(path.join(outer, "elsewhere"), path.join(root, "linked"), "dir")) return;
    const before = snapshot(path.join(outer, "elsewhere"));
    expect(await refused("write_file", { path: "linked/new.txt", content: "pwned" })).toMatchObject({ denied: true });
    expect(await refused("write_file", { path: "linked/deep/er/new.txt", content: "pwned" })).toMatchObject({ denied: true });
    expect(await refused("write_file", { path: "linked/private.txt", content: "pwned" })).toMatchObject({ denied: true });
    expect(await refused("edit_file", { path: "linked/private.txt", oldText: "OUTSIDE", newText: "pwned" })).toMatchObject({ denied: true });
    expect(await refused("delete_path", { path: "linked/private.txt" })).toMatchObject({ denied: true });
    expect(await refused("delete_path", { path: "linked" })).toMatchObject({ denied: true });
    expect(snapshot(path.join(outer, "elsewhere"))).toEqual(before);
    expect(fs.readdirSync(path.join(outer, "elsewhere"))).toEqual(["private.txt"]);
  });

  it("symlink escape: a linked file is never written through, even to a file inside the project", async () => {
    if (!link(path.join(outer, "outside.txt"), path.join(root, "notes.txt"), "file")) return;
    link(path.join(root, "README.md"), path.join(root, "alias.md"), "file");
    for (const target of ["notes.txt", "alias.md"]) {
      expect(await refused("write_file", { path: target, content: "pwned" }), target).toMatchObject({ denied: true });
      expect(await refused("edit_file", { path: target, oldText: "S", newText: "pwned" }), target).toMatchObject({ denied: true });
      expect(await refused("delete_path", { path: target }), target).toMatchObject({ denied: true });
    }
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("OUTSIDE\n");
    expect(read("README.md")).toBe("# Shop\n");
  });

  it("deleting a folder removes a link inside it as a link: what it points at is untouched", async () => {
    fs.mkdirSync(path.join(outer, "elsewhere"));
    fs.writeFileSync(path.join(outer, "elsewhere", "keep.txt"), "KEEP\n");
    if (!link(path.join(outer, "elsewhere"), path.join(root, "src", "old", "shortcut"), "dir")) return;
    const proposal = await proposed("delete_path", { path: "src/old" });
    await proposal.apply();
    expect(exists("src/old")).toBe(false);
    expect(fs.readFileSync(path.join(outer, "elsewhere", "keep.txt"), "utf8")).toBe("KEEP\n");
  });

  it("a link swapped in after the question does not get written through", async () => {
    const proposal = await proposed("write_file", { path: "src/report.txt", content: "report\n" });
    if (!link(path.join(outer, "outside.txt"), path.join(root, "src", "report.txt"), "file")) return;
    expect((await applyChange(call("write_file"), proposal)).ok).toBe(false);
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("OUTSIDE\n");
  });

  it("where a change may land is worked out from the real folders", () => {
    expect(resolveForChange(workspace, "src/new/deep/file.ts")).toEqual({ ok: true, absolute: path.join(workspace.root, "src", "new", "deep", "file.ts"), relative: "src/new/deep/file.ts", exists: false });
    expect(resolveForChange(workspace, "src/cart.ts")).toMatchObject({ ok: true, relative: "src/cart.ts", exists: true });
    expect(resolveForChange(workspace, "README.md/inside.txt")).toEqual({ ok: false, reason: "A file is in the way of that path." });
    // PawOS's own data is off limits wherever it is, and so is any folder that holds it.
    expect(resolveForChange(workspace, "src/cart.ts", [path.join(root, "src")])).toEqual({ ok: false, reason: "It is PawOS's own data." });
    expect(resolveForChange(workspace, "src", [path.join(root, "src", "state")])).toEqual({ ok: false, reason: "It is PawOS's own data." });
  });

  it("the reading tools still can't change anything", async () => {
    const before = snapshot(root);
    for (const [name, args] of TOOLS) expect(await executeTool(call(name, { path: "README.md", ...args }), workspace)).toMatchObject({ ok: false, denied: true });
    expect(snapshot(root)).toEqual(before);
  });
});

describe("what the user is shown is safe and bounded", () => {
  it("a line of a file can't drive the terminal", () => {
    expect(previewText("ok \u001b[2J\u001b[31mred\u0007 \u202Egnp.exe")).toBe("ok [2J[31mred gnp.exe");
    expect(previewText("\tindented")).toBe("  indented");
    expect(previewText("x".repeat(500))).toHaveLength(160);
  });

  it("a large change shows its beginning and says there is more", async () => {
    const big = Array.from({ length: 300 }, (_, index) => `line ${index}`).join("\n");
    const proposal = await proposed("write_file", { path: "big.txt", content: big });
    expect(proposal.preview).toHaveLength(PREVIEW_LINES / 2);
    expect(proposal.previewCut).toBe(true);
    const diff = boundedDiff(big, big.replace(/line/g, "row"));
    expect(diff.lines.length).toBeLessThanOrEqual(PREVIEW_LINES);
    expect(diff).toMatchObject({ startLine: 1, removed: 300, added: 300, cut: true });
    expect(boundedDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual({ startLine: 2, removed: 1, added: 1, cut: false, lines: [{ sign: " ", text: "a" }, { sign: "-", text: "b" }, { sign: "+", text: "B" }, { sign: " ", text: "c" }] });
  });

  it("a proposal never names where the project is on this computer", async () => {
    for (const proposal of [await proposed("write_file", { path: "a/b.ts", content: "x" }), await proposed("edit_file", { path: "src/cart.ts", oldText: "a + b", newText: "a * b" }), await proposed("delete_path", { path: "src/old" })]) {
      expect(JSON.stringify(proposal)).not.toContain(JSON.stringify(outer).slice(1, -1));
    }
  });
});

describe("the loop: a change waits for the user", () => {
  function service(turns: (AgentTurnResponse | ((body: AgentTurnRequest) => Promise<AgentTurnResponse>))[]) {
    const sent: AgentTurnRequest[] = [];
    return {
      sent,
      results: () => sent.slice(1).map((body) => ("result" in body ? body.result : null)!),
      client: {
        agentTurn: async (body: AgentTurnRequest): Promise<AgentTurnResponse> => {
          sent.push(body);
          const next = turns.shift();
          if (!next) throw new Error("PawOS was asked for a turn the test did not expect.");
          return typeof next === "function" ? next(body) : next;
        },
      },
    };
  }
  const tool = (id: string, name: string, args: Record<string, string | number | boolean> = {}, extra: Record<string, unknown> = {}): AgentTurnResponse => ({ turn: { kind: "tool", call: call(name, args, id), note: null, ...extra }, turnsLeft: 10 }) as AgentTurnResponse;
  const finish = (summary: string): AgentTurnResponse => ({ turn: { kind: "finish", summary }, turnsLeft: 0 });
  const options = (client: ReturnType<typeof service>["client"]) => ({ client, workspace, branch: "main", taskId: "11111111-2222-4333-8444-555555555555", goal: "Fix the total", forbidden: [state] });
  const EDIT = { path: "src/cart.ts", oldText: "a + b", newText: "a - b" };

  it("approved: the file changes here, and the result goes back to the model", async () => {
    const pawos = service([tool("step-1", "read_file", { path: "src/cart.ts" }), tool("step-2", "edit_file", EDIT), tool("step-3", "write_file", { path: "src/new.ts", content: "export {};\n" }), finish("Done.")]);
    const asked: Proposal[] = [];
    const outcome = await runLocalTask({ ...options(pawos.client), approve: async (proposal) => (asked.push(proposal), "allow") });
    expect(outcome.status).toBe("finished");
    expect(read("src/cart.ts")).toContain("a - b");
    expect(read("src/new.ts")).toBe("export {};\n");
    expect(asked.map((proposal) => [proposal.operation, proposal.relative, proposal.risk])).toEqual([["Edit file", "src/cart.ts", "write"], ["Create file", "src/new.ts", "write"]]);
    expect(pawos.results()[1]).toEqual({ id: "step-2", ok: true, output: "Edited src/cart.ts: 1 replacement (1 line removed, 1 added)." });
    expect(pawos.results()[2]).toEqual({ id: "step-3", ok: true, output: "Created src/new.ts (1 line)." });
    expect(outcome.steps.map((step) => step.change ?? null)).toEqual([null, { operation: "Edit file", relative: "src/cart.ts", recoverable: false }, { operation: "Create file", relative: "src/new.ts", recoverable: false }]);
  });

  it("denied: nothing changes, and the model is told the user said no", async () => {
    const before = snapshot(root);
    const pawos = service([tool("step-1", "edit_file", EDIT), tool("step-2", "write_file", { path: "x.ts", content: "x" }), tool("step-3", "delete_path", { path: "src/old" }), finish("Nothing done.")]);
    const outcome = await runLocalTask({ ...options(pawos.client), approve: async () => "deny" });
    expect(outcome.status).toBe("finished");
    expect(snapshot(root)).toEqual(before);
    for (const result of pawos.results()) expect(result).toMatchObject({ ok: false, denied: true, output: DECLINED });
    expect(outcome.steps.some((step) => step.change)).toBe(false);
  });

  it("with nobody to ask, the answer is no", async () => {
    const before = snapshot(root);
    const pawos = service([tool("step-1", "write_file", { path: "x.ts", content: "x" }), tool("step-2", "delete_path", { path: "README.md" }), finish("x")]);
    await runLocalTask(options(pawos.client));
    expect(snapshot(root)).toEqual(before);
    expect(pawos.results().map((result) => result.denied)).toEqual([true, true]);
  });

  it("the service can't approve for the user: flags on a step change nothing", async () => {
    const before = snapshot(root);
    const flags = { safe: true, approved: true, risk: "read", permission: "granted", skipApproval: true };
    const pawos = service([
      { turn: { kind: "tool", call: { id: "step-1", name: "delete_path", args: { path: "src/old", approved: true, force: true }, ...flags }, note: null, ...flags }, turnsLeft: 9, ...flags } as unknown as AgentTurnResponse,
      tool("step-2", "write_file", { path: "README.md", content: "gone" }, flags),
      finish("x"),
    ]);
    const asked: Proposal[] = [];
    await runLocalTask({ ...options(pawos.client), approve: async (proposal) => (asked.push(proposal), "deny") });
    // Both were put to the user, as what they are.
    expect(asked.map((proposal) => [proposal.risk, proposal.operation])).toEqual([["delete", "Delete folder"], ["write", "Replace file"]]);
    expect(snapshot(root)).toEqual(before);
  });

  it("a change that is refused before the question is never put to the user", async () => {
    const pawos = service([tool("step-1", "write_file", { path: ".env", content: "API_KEY=stolen" }), tool("step-2", "delete_path", { path: ".git" }), tool("step-3", "write_file", { path: "../outside.txt", content: "x" }), tool("step-4", "edit_file", { path: "src/cart.ts", oldText: "nope", newText: "x" }), finish("x")]);
    let asked = 0;
    await runLocalTask({ ...options(pawos.client), approve: async () => ((asked += 1), "allow") });
    expect(asked).toBe(0);
    expect(pawos.results().map((result) => [result.ok, result.denied ?? false])).toEqual([[false, true], [false, true], [false, true], [false, false]]);
    expect(pawos.results()[3]!.output).toMatch(/^\[edit_not_found\]/);
    expect(read(".env")).toBe("API_KEY=sk-live-very-secret\n");
  });

  it("a failed edit goes back as a failure, so the model can read again and retry", async () => {
    const pawos = service([tool("step-1", "edit_file", { path: "src/cart.ts", oldText: "a+b", newText: "a - b" }), tool("step-2", "read_file", { path: "src/cart.ts" }), tool("step-3", "edit_file", EDIT), finish("Fixed on the second try.")]);
    const outcome = await runLocalTask({ ...options(pawos.client), approve: async () => "allow" });
    expect(outcome.status).toBe("finished");
    expect(pawos.results()[0]).toMatchObject({ ok: false, output: expect.stringMatching(/^\[edit_not_found\]/) });
    expect(pawos.results()[2]!.ok).toBe(true);
    expect(read("src/cart.ts")).toContain("a - b");
  });

  it("cancelled while the question is open: nothing is written and nothing more is sent", async () => {
    const before = snapshot(root);
    const stop = new AbortController();
    const pawos = service([tool("step-1", "edit_file", EDIT), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approve: () => new Promise(() => stop.abort()) });
    expect(outcome.status).toBe("cancelled");
    expect(pawos.sent).toHaveLength(1);
    expect(snapshot(root)).toEqual(before);
  });

  it("cancelled just as the user says yes: still nothing is written", async () => {
    const before = snapshot(root);
    const stop = new AbortController();
    const pawos = service([tool("step-1", "delete_path", { path: "src/old" }), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approve: async () => (stop.abort(), "allow") });
    expect(outcome.status).toBe("cancelled");
    expect(snapshot(root)).toEqual(before);
  });

  it("changes made before a stop are reported with the outcome", async () => {
    const pawos = service([tool("step-1", "write_file", { path: "a.ts", content: "a" }), tool("step-2", "git_status"), tool("step-3", "git_status")]);
    const outcome = await runLocalTask({ ...options(pawos.client), limits: { turns: 2 }, approve: async () => "allow" });
    expect(outcome.status).toBe("stopped");
    expect(outcome.steps.flatMap((step) => (step.change ? [step.change.relative] : []))).toEqual(["a.ts"]);
  });
});
