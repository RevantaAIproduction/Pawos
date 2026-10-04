import { WEB_POLICY, type CodeChangeScope } from "../webPolicy/webCapabilities";

/**
 * Which repository files a code change from PawOS Web may read or write, by scope. Enforced on the
 * server on every path the model asks for or returns; the model's own instructions say the same,
 * but they are not the control.
 *
 *  - "small" (Paw Go): frontend source, styles and markup only — text, headings, titles, buttons.
 *    Existing files only: no new files, and no assets (images, icons, SVGs, fonts, media) added.
 *  - "full" (paid plans): any source file, frontend or backend.
 *
 * Never, in any scope: secrets and environment files, keys, CI workflows, lockfiles, the .git
 * directory, build output and dependencies, binary files, or a path outside the repository.
 */

const FRONTEND_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js", ".mjs", ".vue", ".svelte", ".astro", ".css", ".scss", ".sass", ".less", ".html", ".htm", ".mdx"];

/** Directory names that hold backend, server or tooling code even in a frontend project. */
const NON_FRONTEND_SEGMENTS = new Set([
  "api", "server", "servers", "backend", "functions", "lambda", "lambdas", "migrations", "supabase", "prisma", "db", "database",
  "scripts", "bin", "infra", "terraform", "deploy", "node_modules", "vendor", "dist", "build", "out", ".next", "coverage",
]);

/** Plain .ts/.js files are frontend only under these directories; .tsx/.jsx/.vue/... are frontend anywhere. */
const SCRIPT_ONLY_EXTENSIONS = new Set([".ts", ".js", ".mjs"]);
const FRONTEND_SCRIPT_DIRS = new Set(["components", "component", "pages", "app", "views", "ui", "hooks", "styles", "layouts", "widgets", "features", "frontend", "client", "web"]);

/** File names that are configuration even with a frontend extension. */
const CONFIG_NAME = /(^|\.)(config|conf|rc)\.(t|j|mj|cj)s$|^(next|vite|webpack|rollup|tailwind|postcss|babel|jest|vitest|playwright|eslint|prettier|svelte|astro|nuxt|remix)\.[\w.]*$|\.(test|spec)\.[jt]sx?$|^middleware\.[jt]s$|^proxy\.[jt]s$|^route\.[jt]s$/i;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** Normalises a repository path, or null if it is not a plain path inside the repository. */
export function normaliseRepoPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().replace(/^\.?\/+/, "");
  if (!path || path.length > 300 || path.includes("\\") || path.includes("\0")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

/** True when PawOS Web may read or write this repository path as part of a frontend change. */
export function isFrontendPath(raw: unknown): boolean {
  const path = normaliseRepoPath(raw);
  if (!path) return false;
  const segments = path.split("/");
  const name = segments[segments.length - 1];
  const directories = segments.slice(0, -1).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => segment.startsWith("."))) return false; // .github, .env, .vscode, …
  if (directories.some((segment) => NON_FRONTEND_SEGMENTS.has(segment))) return false;
  const extension = extensionOf(name);
  if (!FRONTEND_EXTENSIONS.includes(extension)) return false;
  if (CONFIG_NAME.test(name) || /\.d\.ts$/i.test(name)) return false;
  if (SCRIPT_ONLY_EXTENSIONS.has(extension) && !directories.some((segment) => FRONTEND_SCRIPT_DIRS.has(segment))) return false;
  return true;
}

/** Text files a full-scope change may edit (source, config, docs). Binary and generated files are not. */
const TEXT_EXTENSIONS = new Set([
  ...FRONTEND_EXTENSIONS,
  ".svg",
  ".cjs", ".cts", ".mts", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".md", ".txt", ".sql", ".prisma", ".graphql", ".gql",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts", ".swift", ".php", ".cs", ".c", ".h", ".cpp", ".hpp", ".sh", ".xml", ".ini", ".properties", ".gradle",
]);
/** Never edited, in any scope. */
const FORBIDDEN_NAME = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore|jks)|id_(rsa|ed25519|ecdsa)(\.pub)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|go\.sum)$/i;
const FORBIDDEN_DIRS = new Set([".git", ".github", "node_modules", "vendor", "dist", "build", "out", ".next", "coverage", ".vercel", ".netlify"]);

/** True when a full-scope change (paid plans) may read or write this path. */
export function isFullScopePath(raw: unknown): boolean {
  const path = normaliseRepoPath(raw);
  if (!path) return false;
  const segments = path.split("/");
  const name = segments[segments.length - 1];
  if (segments.slice(0, -1).some((segment) => FORBIDDEN_DIRS.has(segment.toLowerCase()))) return false;
  // An example env file holds no secrets by convention; every other env file does.
  if (/^\.env\.(example|sample|template)$/i.test(name)) return true;
  if (FORBIDDEN_NAME.test(name)) return false;
  if (name.startsWith(".")) return /^\.(eslintrc|prettierrc|babelrc)(\.(json|js|cjs|yml|yaml))?$/i.test(name);
  return TEXT_EXTENSIONS.has(extensionOf(name)) || /^(Dockerfile|Makefile|Procfile)$/.test(name);
}

/** The path rule for a scope. */
export function isEditablePath(raw: unknown, scope: CodeChangeScope): boolean {
  return scope === "small" ? isFrontendPath(raw) : isFullScopePath(raw);
}

/**
 * References to assets in source text: an image, icon, font or media file path, an inline `data:`
 * URL, or an inline <svg>. A small change (Paw Go) may not add any.
 */
const ASSET_REFERENCE = /data:[a-z]+\/[\w.+-]+[;,]|<svg[\s>]|[\w./-]+\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|heic|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|pdf)\b/gi;

function assetReferenceCount(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(ASSET_REFERENCE)) counts.set(match[0].toLowerCase(), (counts.get(match[0].toLowerCase()) ?? 0) + 1);
  return counts;
}

/** True when `after` references an asset more often than `before` did — a new image, icon, font, … */
export function addsAssetReference(before: string, after: string): boolean {
  const old = assetReferenceCount(before);
  for (const [reference, count] of assetReferenceCount(after)) if (count > (old.get(reference) ?? 0)) return true;
  return false;
}

/** Lines added or removed between two versions of a file (a multiset line difference — cheap, conservative). */
export function changedLineCount(before: string, after: string): number {
  const counts = new Map<string, number>();
  for (const line of before.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after.split("\n")) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added += 1;
  }
  let removed = 0;
  for (const left of counts.values()) removed += left;
  return added + removed;
}

export interface CodeEdit {
  path: string;
  /** The complete new content of the file. */
  content: string;
}

/**
 * Checks the model's proposed edits against the scope's policy; returns the accepted edits or why
 * they were refused. `originals` are the files as read, so a small change's size can be measured.
 */
export function validateEdits(raw: unknown, scope: CodeChangeScope, originals: ReadonlyMap<string, string> = new Map()): { ok: true; edits: CodeEdit[] } | { ok: false; reason: string } {
  const limits = WEB_POLICY.codeChange[scope];
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: "no_changes" };
  if (raw.length > limits.maxFilesChanged) return { ok: false, reason: "too_many_files" };
  const edits: CodeEdit[] = [];
  const seen = new Set<string>();
  for (const item of raw as { path?: unknown; content?: unknown }[]) {
    const path = normaliseRepoPath(item?.path);
    if (!path || !isEditablePath(path, scope)) return { ok: false, reason: scope === "small" ? "not_frontend" : "not_allowed" };
    if (seen.has(path)) return { ok: false, reason: "duplicate_path" };
    // Paw Go edits files it read; it never creates one.
    if (scope === "small" && !originals.has(path)) return { ok: false, reason: "new_file" };
    if (typeof item.content !== "string" || !item.content.trim()) return { ok: false, reason: "empty_file" };
    if (Buffer.byteLength(item.content, "utf8") > limits.maxFileBytes) return { ok: false, reason: "file_too_large" };
    seen.add(path);
    edits.push({ path, content: item.content });
  }
  if (scope === "small" && edits.some((edit) => addsAssetReference(originals.get(edit.path) ?? "", edit.content))) return { ok: false, reason: "adds_asset" };
  const changedLines = edits.reduce((total, edit) => total + changedLineCount(originals.get(edit.path) ?? "", edit.content), 0);
  if (changedLines > limits.maxChangedLines) return { ok: false, reason: "too_large" };
  return { ok: true, edits };
}

/**
 * Cheap checks for an edit that is obviously broken — the "suspicious" ones a change must not be
 * pushed with: leftover merge markers, invalid JSON, a file the model cut off. Returns the problems.
 */
export function suspiciousEdits(edits: readonly CodeEdit[]): { path: string; problem: string }[] {
  const problems: { path: string; problem: string }[] = [];
  for (const edit of edits) {
    if (/^(<{7}|={7}|>{7})( |$)/m.test(edit.content)) problems.push({ path: edit.path, problem: "leftover merge-conflict markers" });
    if (/\.json$/i.test(edit.path)) {
      try {
        JSON.parse(edit.content);
      } catch {
        problems.push({ path: edit.path, problem: "invalid JSON" });
      }
    }
    if (/\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro|css|scss|less|java|kt|go|rs|cs|php|swift|c|cpp|h)$/i.test(edit.path)) {
      // A file the model cut off mid-way has more opening than closing brackets. Strings first (so a
      // "https://" isn't read as a comment), then comments; a rough count with some slack.
      const code = edit.content.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const open = (code.match(/[{(\[]/g) ?? []).length;
      const close = (code.match(/[})\]]/g) ?? []).length;
      if (open - close > 2) problems.push({ path: edit.path, problem: "unbalanced brackets — the file may be cut off" });
    }
  }
  return problems;
}
