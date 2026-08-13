import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import { TEST_FILE_PATTERN } from './ProjectAnalyzer';
import { KNOWN_BUILD_FILE_NAMES, KNOWN_CONFIG_FILE_NAMES } from './knownConfigFileNames';
import { isImageMetadataFormatAllowed } from './safeImageMetadata';

// Same SKIP_DIRS/depth-cap convention as ProjectMapBuilder/DependencyGraphWorker/FeatureMapBuilder's
// schema walk — kept as its own copy per the Phase 1 Technical Debt Register's "duplicate walk-bound
// constants" entry (an established, already-accepted codebase convention, not a new debt item).
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache']);
const MAX_DEPTH = 10;
const MAX_FILES = 5000;

// A pathologically large image (or a non-image file with an image extension) must never be read
// fully into memory just to attempt dimension extraction.
const MAX_IMAGE_METADATA_BYTES = 20 * 1024 * 1024;

export type AssetKind = 'image' | 'stylesheet' | 'config' | 'markdown' | 'buildFile' | 'sourceCode' | 'test' | 'other';

export type ImageAssetMetadata = { width: number; height: number; type: string };

export type ClassifiedAsset = {
  path: string;
  kind: AssetKind;
  /** Present only for kind: 'image', and only when dimension extraction actually succeeded. */
  imageMetadata?: ImageAssetMetadata;
};

export type ProjectAssetMap = { assets: ClassifiedAsset[]; truncated: boolean };

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);
const STYLESHEET_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const SOURCE_CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.go',
  '.rb',
  '.php',
  '.rs',
  '.c',
  '.cpp',
  '.cs',
]);

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

function classifyByExtensionAndName(relPath: string): AssetKind {
  const base = path.basename(relPath);
  const ext = path.extname(base).toLowerCase();

  if (TEST_FILE_PATTERN.test(base)) return 'test';
  if (KNOWN_BUILD_FILE_NAMES.has(base)) return 'buildFile';
  if (KNOWN_CONFIG_FILE_NAMES.has(base)) return 'config';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (STYLESHEET_EXTENSIONS.has(ext)) return 'stylesheet';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (SOURCE_CODE_EXTENSIONS.has(ext)) return 'sourceCode';
  return 'other';
}

/** Best-effort image dimension read — a corrupt/truncated/oversized file yields no metadata rather than throwing, matching every other reader in this codebase's "one bad file never breaks the whole analysis" discipline (e.g. FeatureMapBuilder.ts's readTextFile). */
function readImageMetadata(absPath: string): ImageAssetMetadata | undefined {
  try {
    if (!isImageMetadataFormatAllowed(absPath)) return undefined;
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_METADATA_BYTES) return undefined;
    const buffer = fs.readFileSync(absPath);
    const dims = imageSize(buffer);
    if (dims.width === undefined || dims.height === undefined) return undefined;
    return { width: dims.width, height: dims.height, type: dims.type ?? 'unknown' };
  } catch {
    return undefined;
  }
}

/**
 * Deterministic, extension/exact-name classification (Coding Runtime V2, §11) — no AI call, unlike
 * `fileClassifier.ts`, which is Gemini-based personal-document classification (resume/invoice/
 * contract/etc.) confirmed the wrong fit for code-repo assets during the Phase 1 architecture pass,
 * not reused here. A file is classified only by real, checkable convention (extension, exact known
 * file name, the same `TEST_FILE_PATTERN` `ProjectAnalyzer.ts` already exports) — never guessed.
 */
export function classifyAsset(root: string, relPath: string): ClassifiedAsset {
  const kind = classifyByExtensionAndName(relPath);
  if (kind === 'image') {
    const imageMetadata = readImageMetadata(path.join(root, relPath));
    return imageMetadata ? { path: relPath, kind, imageMetadata } : { path: relPath, kind };
  }
  return { path: relPath, kind };
}

/** Bounded directory walk (same SKIP_DIRS/depth-cap convention as ProjectMapBuilder/DependencyGraphWorker) — every real file in the project gets classified, not just the subset a LanguageProvider can parse (images/stylesheets/config never appear in the dependency graph's file set at all). */
function walkProjectFiles(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  let truncated = false;

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
      } else {
        files.push(normalizeRel(path.relative(root, full)));
      }
    }
  }

  walk(root, 0);
  return { files, truncated };
}

/** Walks the whole project and classifies every real file found — the entry point `ClassifyProjectAssetsPlugin` calls, mirroring `FeatureMapBuilder.buildFeatureMap()`'s "one exported orchestration function" shape. */
export function classifyProjectAssets(root: string): ProjectAssetMap {
  const { files, truncated } = walkProjectFiles(root);
  return { assets: files.map((relPath) => classifyAsset(root, relPath)), truncated };
}
