import path from "node:path";
import { readdir, lstat } from "node:fs/promises";
import { assertSafeRoot, assertContainedNoLinks, isSensitiveName, MAX_DEPTH, MAX_ENTRIES } from "./safety.js";

const PROJECT_MARKERS = new Set([".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json", "deno.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "target", "vendor", ".venv", "venv", "coverage", ".cache"]);

export async function discoverProject(cwd = process.cwd()) {
  const root = await assertSafeRoot(cwd);
  const candidates = [];
  const queue = [{ dir: root, depth: 0 }];
  let seen = 0;
  while (queue.length && seen < MAX_ENTRIES) {
    const { dir, depth } = queue.shift();
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      if (++seen > MAX_ENTRIES) break;
      if (isSensitiveName(name)) continue;
      const full = path.join(dir, name);
      try { await assertContainedNoLinks(root, full); } catch { continue; }
      let st;
      try { st = await lstat(full); } catch { continue; }
      if (PROJECT_MARKERS.has(name)) candidates.push({ relativePath: path.relative(root, full) || ".", type: name === ".git" ? "git_metadata" : "project_metadata", detail: "name_detected_only" });
      if (st.isDirectory() && !st.isSymbolicLink() && depth < MAX_DEPTH && !EXCLUDED_DIRS.has(name.toLowerCase())) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  const markerAtRoot = candidates.some(x => path.dirname(x.relativePath) === "." || x.relativePath === ".");
  return { root, inventory: { projectRoot: root, rootKind: markerAtRoot ? "project_marker_detected" : "directory_selected", scanLimits: { maxDepth: MAX_DEPTH, maxEntries: MAX_ENTRIES }, candidates, contentsParsed: false } };
}
