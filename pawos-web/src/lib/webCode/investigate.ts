import { normaliseRepoPath } from "./codePolicy";

/**
 * Following the code: which other repository files a file refers to, and which files a failure
 * report names. Both are worked out from text PawOS has actually read (file contents from GitHub,
 * reports from the repository's own checks) and are only ever paths that exist in the repository's
 * file list — nothing is guessed, and nothing here runs or evaluates any code.
 */

const SCRIPT_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro", ".json", ".css", ".scss", ".sass", ".less", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs"];

/** import x from "…", export … from "…", import("…"), require("…"), import "…", and CSS @import / url(). */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|@import\s+(?:url\(\s*)?|@use\s+|@forward\s+)(["'])([^"'\n]{1,200})\1/g;
/** Python: `from a.b import c`, `from .a import c`, `import a.b`. */
const PYTHON_IMPORT = /^\s*(?:from\s+(\.*[\w.]*)\s+import\b|import\s+([\w.]+))/gm;

function join(directory: string, relative: string): string | null {
  const segments = directory ? directory.split("/") : [];
  for (const part of relative.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null; // outside the repository
      segments.pop();
    } else segments.push(part);
  }
  return normaliseRepoPath(segments.join("/"));
}

function firstKnown(base: string | null, known: ReadonlySet<string>): string | null {
  if (!base) return null;
  // TypeScript sources are often imported by their compiled name ("./x.js" for x.ts).
  const bases = /\.(m|c)?js$/.test(base) ? [base, base.replace(/\.(m|c)?js$/, "")] : [base];
  for (const candidate of bases) for (const suffix of SCRIPT_SUFFIXES) if (known.has(candidate + suffix)) return candidate + suffix;
  return null;
}

/**
 * The repository files `content` (the file at `path`) imports or includes, in the order they
 * appear. Package imports resolve to nothing; relative ones, the common "@/" and "~/" source
 * aliases, and root-relative paths resolve only to files that exist.
 */
export function referencedPaths(path: string, content: string, known: ReadonlySet<string>): string[] {
  const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const found: string[] = [];
  const add = (resolved: string | null) => {
    if (resolved && resolved !== path && !found.includes(resolved)) found.push(resolved);
  };

  if (/\.py$/i.test(path)) {
    for (const match of content.matchAll(PYTHON_IMPORT)) {
      const spec = match[1] ?? match[2] ?? "";
      const dots = spec.match(/^\.*/)?.[0].length ?? 0;
      const modulePath = spec.slice(dots).replace(/\./g, "/");
      const base = dots > 0 ? join(directory, `${"../".repeat(dots - 1)}${modulePath}`) : normaliseRepoPath(modulePath);
      if (!base) continue;
      add([`${base}.py`, `${base}/__init__.py`].find((candidate) => known.has(candidate)) ?? null);
    }
    return found;
  }

  for (const match of content.matchAll(SPECIFIER)) {
    const spec = match[2].split(/[?#]/)[0];
    if (!spec || /^[a-z][a-z0-9+.-]*:/i.test(spec)) continue; // https:, node:, data: …
    if (spec.startsWith(".")) add(firstKnown(join(directory, spec), known));
    else if (spec.startsWith("@/") || spec.startsWith("~/")) add(firstKnown(normaliseRepoPath(`src/${spec.slice(2)}`), known) ?? firstKnown(normaliseRepoPath(spec.slice(2)), known));
    else if (spec.startsWith("/")) add(firstKnown(normaliseRepoPath(spec.slice(1)), known) ?? firstKnown(normaliseRepoPath(`src${spec}`), known) ?? firstKnown(normaliseRepoPath(`public${spec}`), known));
    else if (spec.includes("/")) add(firstKnown(normaliseRepoPath(spec), known)); // a root-relative import (baseUrl), never a package
  }
  return found;
}

/**
 * The repository files a failure report names (a compiler error's "src/a.ts:12", a test's path, a
 * check annotation). Longest paths first, so "src/app/page.tsx" is not also read as "page.tsx".
 */
export function pathsNamedIn(report: string, known: ReadonlySet<string>, limit = 20): string[] {
  if (!report) return [];
  const text = report.replace(/\\/g, "/");
  const hits: { path: string; at: number }[] = [];
  for (const path of [...known].sort((a, b) => b.length - a.length)) {
    if (path.length < 4) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(path, from);
      if (at < 0) break;
      const before = at > 0 ? text[at - 1] : "";
      const after = text[at + path.length] ?? "";
      const covered = hits.some((hit) => at >= hit.at && at < hit.at + hit.path.length);
      // A whole path: not the tail of a longer name, and not the head of one.
      if (!covered && !/[\w.-]/.test(before) && !/[\w/-]/.test(after) && !(after === "." && /\w/.test(text[at + path.length + 1] ?? ""))) {
        hits.push({ path, at });
        break;
      }
      from = at + 1;
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.path).slice(0, limit);
}
