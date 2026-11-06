import { DOC_PATHS, detectDocImpact, generateDocs, writableFiles, type DocId, type FileChange, type SourceFile } from "./engine";
import { isSecretPath } from "./engine/secrets";
import { isDocumentationPath } from "../webCode/codePolicy";
import type { CodeChangeScope } from "../webPolicy/webCapabilities";

/**
 * Keeps a repository's documentation in step with a PawOS Web code change, in the same commit (or
 * pull request) as the code. The documentation engine (./engine) generates the updates from the
 * changed files and the evidence it reads from the repository; the model writes none of it.
 *
 * Only documentation the repository already keeps is touched: files that exist and carry PawOS's
 * managed sections, a new component page in a folder whose index exists, and an entry under
 * Unreleased in an existing CHANGELOG.md. User text and hand-edited sections are kept.
 *
 * Web reads the repository file by file, so it only syncs the documents it can re-derive from a
 * bounded read (UI docs, the database, the API, the changelog). The others are named as possibly
 * out of date instead of being regenerated from a partial view.
 */

/** Documents whose evidence Web can read in full within the budget, and which files that takes. */
const EVIDENCE: Partial<Record<DocId, (path: string) => boolean>> = {
  components: (p) => /\.(tsx|jsx)$/.test(p),
  widgets: (p) => /\.(tsx|jsx)$/.test(p),
  pages: (p) => /\.(tsx|jsx)$/.test(p),
  "ui-flows": (p) => /\.(tsx|jsx)$/.test(p),
  "design-system": (p) => /\.(tsx|jsx|css|scss|sass|less)$/.test(p) || /(^|\/)package\.json$/.test(p),
  database: (p) => /\.(sql|prisma)$/i.test(p),
  api: (p) => /(^|\/)app\/(.*\/)?route\.(ts|js)$/.test(p) || /(^|\/)pages\/api\//.test(p),
};

export const DOC_SYNC_LIMITS = { maxSourceFiles: 150, maxSourceBytes: 2_000_000, maxDocFiles: 40, maxDocBytes: 200_000, maxWrites: 12 } as const;

export interface DocSyncInput {
  scope: CodeChangeScope;
  /** The change's files after the edit, and the originals they replace (missing = new file). */
  edits: { path: string; content: string }[];
  originals: ReadonlyMap<string, string>;
  /** Every file in the repository at the base commit, with sizes. */
  tree: { path: string; size: number }[];
  readFile: (path: string) => Promise<string | null>;
  /** What the change did, for the changelog (only used when the repository has a CHANGELOG.md). */
  changelogEntry?: { category: "Added" | "Changed" | "Fixed"; entry: string };
  date: string;
}

export interface DocSyncResult {
  edits: { path: string; content: string }[];
  /** One line per document: updated, kept as the user edited it, or possibly out of date. */
  notes: string[];
}

async function readAll(paths: string[], read: (path: string) => Promise<string | null>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 8) {
    const batch = paths.slice(i, i + 8);
    const contents = await Promise.all(batch.map((p) => read(p).catch(() => null)));
    batch.forEach((p, j) => {
      const content = contents[j];
      if (typeof content === "string") out.set(p, content);
    });
  }
  return out;
}

export async function syncDocumentation(input: DocSyncInput): Promise<DocSyncResult> {
  const changes: FileChange[] = input.edits.map((e) => ({ path: e.path, kind: input.originals.has(e.path) ? "modified" : "added" }));
  const impacts = detectDocImpact(changes);
  const treePaths = input.tree.map((t) => t.path);
  const docFiles = input.tree.filter((t) => /\.(md|mmd)$/i.test(t.path) && isDocumentationPath(t.path, input.scope));
  const keepsChangelog = docFiles.some((t) => t.path === "CHANGELOG.md") && Boolean(input.changelogEntry);
  if (impacts.length === 0 && !keepsChangelog) return { edits: [], notes: [] };

  const notes: string[] = [];
  const derivable = impacts.filter((i) => EVIDENCE[i.doc]);
  for (const i of impacts.filter((x) => !EVIDENCE[x.doc])) {
    if (docFiles.some((t) => t.path === DOC_PATHS[i.doc])) {
      notes.push(`${i.doc}: may be out of date (${i.reason}); regenerate it with a full documentation run in PawOS Desktop.`);
    }
  }

  // Existing documentation the engine may merge into (only what this plan may write).
  const docReads = docFiles.filter((t) => t.size <= DOC_SYNC_LIMITS.maxDocBytes).slice(0, DOC_SYNC_LIMITS.maxDocFiles);
  const existing = Object.fromEntries(await readAll(docReads.map((t) => t.path), input.readFile));
  const hasPawosDocs = Object.values(existing).some((c) => c.includes("<!-- pawos:begin ")) || Object.keys(existing).some((p) => p.endsWith(".mmd"));
  if (!hasPawosDocs && !keepsChangelog) return { edits: [], notes };

  // Evidence: the files the derivable documents need, with this change's new contents.
  const edited = new Map(input.edits.map((e) => [e.path, e.content]));
  const wanted = input.tree.filter((t) => !isSecretPath(t.path) && !edited.has(t.path) && derivable.some((i) => EVIDENCE[i.doc]?.(t.path)));
  const bytes = wanted.reduce((n, t) => n + t.size, 0);
  let allowedDocs = derivable.map((i) => i.doc);
  let sources: SourceFile[] = [];
  if (wanted.length > DOC_SYNC_LIMITS.maxSourceFiles || bytes > DOC_SYNC_LIMITS.maxSourceBytes) {
    for (const i of derivable) if (docFiles.some((t) => t.path === DOC_PATHS[i.doc])) notes.push(`${i.doc}: may be out of date — the repository is too large to re-derive it here.`);
    allowedDocs = [];
  } else {
    const read = await readAll(wanted.map((t) => t.path), input.readFile);
    sources = [...read].map(([path, content]) => ({ path, content }));
  }
  for (const [path, content] of edited) if (!isSecretPath(path)) sources.push({ path, content });

  const result = generateDocs({
    snapshot: { files: sources, allPaths: [...new Set([...treePaths, ...edited.keys()])] },
    existing,
    mode: "sync",
    changes,
    // An empty list keeps sync to the changelog only.
    selection: { docs: allowedDocs },
    changelog: keepsChangelog && input.changelogEntry ? [input.changelogEntry] : undefined,
    date: input.date,
    policy: {
      // Paw Go never creates files; paid plans may add a page to a documentation folder the repository keeps.
      allowCreate: input.scope === "full",
      allowPath: (p) => isDocumentationPath(p, input.scope),
    },
  });

  const writes = writableFiles(result).slice(0, DOC_SYNC_LIMITS.maxWrites);
  for (const f of result.files) {
    if (f.action === "conflict") notes.push(`${f.path}: kept your hand edits (${f.conflicts.join(", ")}); those sections were not regenerated.`);
  }
  for (const w of writes) notes.push(`${w.path}: updated from the change.`);
  if (writableFiles(result).length > writes.length) notes.push(`${writableFiles(result).length - writes.length} more documentation files need updating; regenerate them in PawOS Desktop.`);
  return { edits: writes, notes };
}
