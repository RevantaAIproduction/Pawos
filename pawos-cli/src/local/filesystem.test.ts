import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "../shared";
import { applyChange, prepareChange, type Proposal } from "./changes";
import { executeTool } from "./tools";
import { fileErrorReason, invalidNameReason, openWorkspace, relativeToProject, resolveForChange, resolveInside, type Workspace } from "./workspace";

// Many real files on Windows takes seconds per test, more under a full parallel run: the 5-second default is too tight.
vi.setConfig({ testTimeout: 30_000 });

/**
 * The tools on a real project folder, as people name things on their own computer: full paths to
 * files inside the project, folder and file names with spaces and accents, names Windows won't
 * take, read-only and missing files, several files changed in one go and checked on disk, and the
 * folders a listing never walks into. Run in a throwaway folder made for each test.
 */
let outer: string;
let root: string;
let workspace: Workspace;

const write = (relative: string, content: string) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const call = (name: string, args: Record<string, string | number | boolean> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
async function proposed(name: string, args: Record<string, string | number | boolean>): Promise<Proposal> {
  const prepared = await prepareChange(call(name, args), workspace, { forbidden: [] });
  if (!prepared.ok) throw new Error(`refused: ${prepared.result.output}`);
  return prepared.proposal;
}
async function refusedReason(name: string, args: Record<string, string | number | boolean>): Promise<string> {
  const prepared = await prepareChange(call(name, args), workspace, { forbidden: [] });
  if (prepared.ok) throw new Error(`allowed: ${prepared.proposal.relative}`);
  return prepared.result.output;
}
const tool = (name: string, args: Record<string, string | number | boolean> = {}) => executeTool(call(name, args), workspace);
const flipCase = (text: string) => text.replace(/^[a-z]:/i, (drive) => (drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase()));

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-fs-")));
  // Spaces and accents in the project's own folder name, as in "C:\pawos kb tëst".
  root = path.join(outer, "My Shop tëst");
  fs.mkdirSync(root);
  write("package.json", JSON.stringify({ name: "shop", scripts: { build: "node build.js" } }));
  write("src/App.tsx", 'import logo from "./assets/logo.svg";\nimport "./App.css";\nexport const App = () => <img src={logo} />;\n');
  write("src/assets/logo.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
  write("src/App.css", ".app { color: red; }\n");
  workspace = openWorkspace(root)!;
});
afterEach(() => {
  for (const file of [path.join(root, "src", "readonly.ts")]) {
    try {
      fs.chmodSync(file, 0o666);
    } catch {
      /* not there */
    }
  }
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("full paths to files inside the project", () => {
  it("a full path inside the project is the same as its relative path — for reading, writing and editing", async () => {
    const full = path.join(root, "src", "App.tsx");
    expect(relativeToProject(root, full)).toBe(path.join("src", "App.tsx"));
    expect(resolveInside(workspace, full)).toMatchObject({ ok: true, relative: "src/App.tsx" });
    expect((await tool("read_file", { path: full })).output).toContain('import logo from "./assets/logo.svg";');

    const created = await proposed("write_file", { path: path.join(root, "src", "data", "products.ts"), content: "export const products = [];\n" });
    expect(created.relative).toBe("src/data/products.ts");
    expect((await applyChange(call("write_file"), created)).ok).toBe(true);
    expect(read("src/data/products.ts")).toBe("export const products = [];\n");

    const style = await proposed("edit_file", { path: path.join(root, "src", "App.css"), oldText: "color: red", newText: "color: blue" });
    expect((await applyChange(call("edit_file"), style)).ok).toBe(true);
    expect(read("src/App.css")).toBe(".app { color: blue; }\n");
  });

  it.runIf(process.platform === "win32")("on Windows the drive letter's case doesn't matter", async () => {
    const full = flipCase(path.join(root, "src", "App.tsx"));
    expect(resolveInside(workspace, full)).toMatchObject({ ok: true, relative: "src/App.tsx" });
  });

  it("a full path outside the project is still refused, and so are the project's parent, a sibling and the home folder", async () => {
    fs.writeFileSync(path.join(outer, "outside.txt"), "private\n");
    for (const elsewhere of [path.join(outer, "outside.txt"), outer, path.join(outer, "My Shop tëst-other", "x.ts"), os.homedir(), "~/notes.txt"]) {
      expect(resolveInside(workspace, elsewhere).ok, elsewhere).toBe(false);
    }
    expect(await refusedReason("write_file", { path: path.join(outer, "outside.txt"), content: "x" })).toContain("outside the project");
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("private\n");
  });

  it.runIf(process.platform === "win32")("on Windows: a drive-relative path, a network path and another drive are refused", () => {
    for (const elsewhere of ["C:notes.txt", "\\\\server\\share\\file.txt", root.startsWith("C") ? "D:\\file.txt" : "C:\\file.txt"]) {
      expect(resolveInside(workspace, elsewhere).ok, elsewhere).toBe(false);
    }
  });
});

describe("names as people write them", () => {
  it("spaces, accents and nested folders: created, read back and edited exactly", async () => {
    const relative = "src/My Components/Prodüct Card/ünïcödé file.tsx";
    const content = "export const name = \"Café — ñandú\";\n";
    const created = await proposed("write_file", { path: relative, content });
    expect((await applyChange(call("write_file"), created)).ok).toBe(true);
    expect(read(relative)).toBe(content);
    expect((await tool("read_file", { path: relative })).output).toContain("Café — ñandú");
    // Backslashes work the same as slashes.
    expect((await tool("read_file", { path: relative.replace(/\//g, "\\") })).ok).toBe(process.platform === "win32");
    const edited = await proposed("edit_file", { path: relative, oldText: "Café", newText: "Coffee" });
    expect((await applyChange(call("edit_file"), edited)).ok).toBe(true);
    expect(read(relative)).toBe("export const name = \"Coffee — ñandú\";\n");
    expect((await tool("list_files", { path: "src/My Components" })).output).toContain("src/My Components/Prodüct Card/ünïcödé file.tsx");
  });

  it("names Windows won't take are refused in plain words before anything is written", async () => {
    expect(invalidNameReason("src/report?.txt", "win32")).toMatch(/can't be a file or folder name on Windows/);
    expect(invalidNameReason("src/notes. ", "win32")).toMatch(/ends with a dot or a space/);
    expect(invalidNameReason("src/CON.ts", "win32")).toMatch(/reserved device name/);
    expect(invalidNameReason("src/lpt1", "win32")).toMatch(/reserved device name/);
    expect(invalidNameReason("src/console.ts", "win32")).toBeNull();
    expect(invalidNameReason("src/report?.txt", "linux")).toBeNull();
    if (process.platform === "win32") {
      expect(await refusedReason("write_file", { path: "src/nul.ts", content: "x" })).toMatch(/reserved device name/);
      expect(await refusedReason("write_file", { path: "src/a|b.ts", content: "x" })).toMatch(/can't be a file or folder name/);
      expect(fs.existsSync(path.join(root, "src", "a|b.ts"))).toBe(false);
    }
  });
});

describe("problems reported clearly", () => {
  it("a missing file or folder says so", async () => {
    expect((await tool("read_file", { path: "src/missing.ts" })).output).toBe("That file doesn't exist.");
    expect((await tool("list_files", { path: "src/missing" })).output).toBe("That folder doesn't exist.");
    expect(await refusedReason("edit_file", { path: "src/missing.ts", oldText: "a", newText: "b" })).toMatch(/doesn't exist/);
  });

  it("a read-only file: the change fails with 'permission denied', and the file is untouched", async () => {
    write("src/readonly.ts", "export const locked = true;\n");
    fs.chmodSync(path.join(root, "src", "readonly.ts"), 0o444);
    const edit = await proposed("edit_file", { path: "src/readonly.ts", oldText: "true", newText: "false" });
    const result = await applyChange(call("edit_file"), edit);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("permission denied");
    expect(read("src/readonly.ts")).toBe("export const locked = true;\n");
  });

  it("each file-system failure has its own plain reason, and none repeats the system's text (which can carry a full path)", () => {
    const failure = (code: string) => Object.assign(new Error(`${code}: something at C:\\Users\\someone\\secret\\path`), { code });
    expect(fileErrorReason(failure("EBUSY"), "")).toBe("The file is in use by another program (it is locked). Close it there and try again.");
    expect(fileErrorReason(failure("EPERM"), "")).toContain("permission denied");
    expect(fileErrorReason(failure("ENAMETOOLONG"), "")).toBe("That path is too long for this computer.");
    expect(fileErrorReason(failure("ENOSPC"), "")).toBe("The disk is full.");
    expect(fileErrorReason(failure("EWHATEVER"), "fallback")).toBe("fallback");
    for (const code of ["EBUSY", "EPERM", "ENOENT", "EISDIR", "ENOTDIR", "ENAMETOOLONG", "EINVAL", "ENOSPC", "EROFS"]) expect(fileErrorReason(failure(code), "")).not.toContain("someone");
  });

  it("a locked file while reading is reported as locked, without the system's own text", async () => {
    const spy = vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce(Object.assign(new Error("EBUSY: resource busy or locked, open 'C:\\x\\App.css'"), { code: "EBUSY" }));
    const result = await tool("read_file", { path: "src/App.css" });
    spy.mockRestore();
    expect(result.ok).toBe(false);
    expect(result.output).toBe("PawOS couldn't read that. The file is in use by another program (it is locked). Close it there and try again.");
  });

  it("a locked file (EBUSY while writing) is reported as locked, and nothing else is touched", async () => {
    const edit = await proposed("edit_file", { path: "src/App.css", oldText: "red", newText: "blue" });
    const locked = { ...edit, apply: async () => Promise.reject(Object.assign(new Error("EBUSY: resource busy or locked, open 'C:\\x\\App.css'"), { code: "EBUSY" })) };
    const result = await applyChange(call("edit_file"), locked);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("in use by another program (it is locked)");
    expect(result.output).not.toContain("C:\\x");
    expect(read("src/App.css")).toBe(".app { color: red; }\n");
  });
});

describe("several files in one task", () => {
  it("each change is on disk exactly as written, and nothing outside the request changes", async () => {
    const before = read("src/App.tsx");
    const files: Record<string, string> = {
      "src/data/products.ts": "export const products = [{ id: 1, name: \"Mug\", price: 12 }];\n",
      "src/components/Cart.tsx": "export const Cart = () => <aside>Cart</aside>;\n",
      "src/components/cart.css": ".cart { display: grid; }\n",
    };
    for (const [relative, content] of Object.entries(files)) expect((await applyChange(call("write_file"), await proposed("write_file", { path: relative, content }))).ok).toBe(true);
    const edit = await proposed("edit_file", { path: "src/App.css", oldText: ".app { color: red; }", newText: ".app { color: red; }\n.grid { display: grid; }" });
    expect((await applyChange(call("edit_file"), edit)).ok).toBe(true);
    for (const [relative, content] of Object.entries(files)) expect(read(relative)).toBe(content);
    expect(read("src/App.css")).toBe(".app { color: red; }\n.grid { display: grid; }\n");
    expect(read("src/App.tsx")).toBe(before);
  });

  it("a rename is a new file plus a delete: the content moves exactly, and the old name is gone", async () => {
    const content = read("src/App.css");
    expect((await applyChange(call("write_file"), await proposed("write_file", { path: "src/styles/app.css", content }))).ok).toBe(true);
    expect((await applyChange(call("delete_path"), await proposed("delete_path", { path: "src/App.css" }))).ok).toBe(true);
    expect(read("src/styles/app.css")).toBe(content);
    expect(fs.existsSync(path.join(root, "src", "App.css"))).toBe(false);
  });
});

describe("what a listing walks into", () => {
  it("dependencies, build output, Git data and credential folders are never listed or searched; assets and config are", async () => {
    write("node_modules/react/index.js", "module.exports = 'logo';\n");
    write("dist/assets/index.js", "logo\n");
    write(".git/config", "[core]\n");
    write(".ssh/id_rsa", "secret\n");
    write("public/favicon.svg", "<svg/>\n");
    write("vite.config.ts", "export default {};\n");
    const listed = (await tool("list_files")).output;
    expect(listed).toContain("src/assets/logo.svg");
    expect(listed).toContain("public/favicon.svg");
    expect(listed).toContain("vite.config.ts");
    for (const hidden of ["node_modules", "dist/", ".git/", ".ssh"]) expect(listed).not.toContain(hidden);
    const searched = (await tool("search_files", { query: "logo" })).output;
    expect(searched).toContain("src/App.tsx");
    expect(searched).not.toContain("node_modules");
    expect(searched).not.toContain("dist/");
  });

  it("an asset imported by a component can be found from the import, and the reference checked against the file on disk", async () => {
    const app = (await tool("read_file", { path: "src/App.tsx" })).output;
    const imported = /from "\.\/(assets\/[^"]+)"/.exec(app)?.[1];
    expect(imported).toBe("assets/logo.svg");
    expect((await tool("read_file", { path: `src/${imported}` })).ok).toBe(true);
    expect((await tool("read_file", { path: "src/assets/Logo.svg" })).ok).toBe(process.platform === "win32"); // case: Windows finds it; Linux would not
  });
});

describe("where a change may land", () => {
  it("resolveForChange takes the same full paths and still refuses the project's top folder itself", () => {
    expect(resolveForChange(workspace, path.join(root, "src", "new.ts"))).toMatchObject({ ok: true, relative: "src/new.ts", exists: false });
    expect(resolveForChange(workspace, root)).toMatchObject({ ok: false });
  });
});
