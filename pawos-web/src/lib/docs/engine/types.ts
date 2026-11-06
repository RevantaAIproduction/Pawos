/**
 * PawOS documentation engine — shared types.
 *
 * This folder is the one source of truth for documentation generation. It is plain TypeScript with
 * no imports outside this folder and no Node or browser APIs, so the same files run in the Desktop
 * main process, the Desktop renderer and PawOS Web's server. PawOS Web keeps a byte-identical copy
 * in pawos-web/src/lib/docs/engine/ (Next.js cannot import outside its own root); a parity test in
 * each suite fails if the two copies differ.
 *
 * Every adapter hands the engine the same thing — a ProjectSnapshot of files it really read — and
 * gets back a DocGenerationResult. The engine never reads or writes anything itself.
 */

/** The three kinds of documentation PawOS generates. */
export type DocCategory = 'product' | 'architecture' | 'ui';

export type DocId =
  // Type 1: product and project
  | 'readme'
  | 'prd'
  | 'requirements'
  | 'implementation-plan'
  | 'changelog'
  // Type 2: architecture and engineering
  | 'architecture'
  | 'database'
  | 'api'
  | 'auth'
  | 'testing'
  | 'deployment'
  | 'adr'
  // Type 3: UI
  | 'components'
  | 'widgets'
  | 'design-system'
  | 'pages'
  | 'ui-flows';

/** One file an adapter actually read. `path` is relative to the project root, with forward slashes. */
export interface SourceFile {
  path: string;
  content: string;
}

/** What the adapter knows about the project. Everything here must come from the real project. */
export interface ProjectSnapshot {
  /** A display name; package.json's name wins when present. */
  name?: string;
  /** Contents of the files the adapter read (source, schemas, configs, existing docs). */
  files: SourceFile[];
  /** Every path in the project the adapter saw (contents or not). Used for "does this exist". */
  allPaths?: string[];
  /** A real import graph (relative path → relative paths it imports), when the runtime has one. */
  dependencyEdges?: Record<string, string[]>;
  /** Feature clusters, when the runtime has discovered them (Desktop's semantic index). */
  features?: { name: string; files: string[] }[];
  /** True when the adapter stopped early (file count or size limits): docs say so. */
  truncated?: boolean;
}

export type FileChangeKind = 'added' | 'modified' | 'deleted';

/** One file a task changed — from Desktop's change ledger, Web Code mode's edits or the CLI agent's steps. */
export interface FileChange {
  path: string;
  kind: FileChangeKind;
}

/** An approved project plan, saved as product documents. */
export interface ApprovedPlan {
  title?: string;
  /** The plan as the user approved it (Markdown). */
  markdown: string;
}

/** A new architecture decision record. */
export interface AdrInput {
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  alternatives?: string[];
  status?: 'proposed' | 'accepted' | 'superseded' | 'deprecated';
}

export interface ChangelogInput {
  category: 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Security' | 'Deprecated';
  entry: string;
}

/** Which documents to produce. Empty selection = every document the evidence supports. */
export interface DocSelection {
  categories?: DocCategory[];
  docs?: DocId[];
  /** A natural-language request ("update the API docs and the ERD"); keywords pick documents. */
  text?: string;
}

/** What may be written. Adapters set this from the runtime's own rules and the user's plan. */
export interface DocPolicy {
  /** May new documentation files be created? (Paw Go on Web: no.) */
  allowCreate: boolean;
  /** An extra per-path rule (plan scope, protected paths). Return false to skip a path. */
  allowPath?: (path: string) => boolean;
  /**
   * A file that exists but has no PawOS managed blocks belongs to the user. By default it is left
   * alone; with adoptUnmanaged the generated blocks are appended after the user's content.
   */
  adoptUnmanaged?: boolean;
  /** At most this many component/widget pages per run (the rest are listed as skipped). */
  maxComponentDocs?: number;
}

export interface GenerateDocsInput {
  snapshot: ProjectSnapshot;
  /** Current contents of documentation files, by path. Missing = the file does not exist. */
  existing: Record<string, string>;
  /** Full mode: which documents to produce. Sync mode: `docs`, when given, limits which affected documents are updated. */
  selection?: DocSelection;
  /**
   * 'full' — produce the selected documents.
   * 'sync' — only the documents the `changes` affect; used by triggers after a code change.
   */
  mode?: 'full' | 'sync';
  changes?: FileChange[];
  plan?: ApprovedPlan;
  adr?: AdrInput;
  changelog?: ChangelogInput[];
  policy?: DocPolicy;
  /** ISO date (YYYY-MM-DD) for changelog headings and ADRs. Adapters pass the real date. */
  date: string;
}

export type DocAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'skipped';

export interface ValidationProblem {
  /** 'mermaid' | 'secret' | 'link' | 'structure' */
  kind: string;
  message: string;
  line?: number;
}

export interface DocFileOutcome {
  path: string;
  doc: DocId;
  category: DocCategory;
  action: DocAction;
  /** The complete new file content (for create/update). Absent when nothing should be written. */
  content?: string;
  /** Why this action was chosen — shown to the user. */
  reason: string;
  /** Managed blocks the user edited by hand: kept as the user left them, not regenerated. */
  conflicts: string[];
  /** Statements the engine could not verify from the source, written into the doc as such. */
  uncertain: string[];
  /** Validation of the generated content. A file that fails validation is never written. */
  problems: ValidationProblem[];
}

export interface EvidenceSummary {
  filesRead: number;
  components: number;
  widgets: number;
  pages: number;
  apiRoutes: number;
  tables: number;
  testFiles: number;
  stack: string[];
  truncated: boolean;
}

export interface DocGenerationResult {
  ok: boolean;
  files: DocFileOutcome[];
  summary: Record<DocAction, number>;
  evidence: EvidenceSummary;
  /** Documents that were asked for but have nothing in the source to describe. */
  notApplicable: { doc: DocId; reason: string }[];
  warnings: string[];
}
