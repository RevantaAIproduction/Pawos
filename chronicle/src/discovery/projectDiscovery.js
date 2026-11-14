import path from "node:path";
import { readdir, lstat } from "node:fs/promises";
import { inspectGitRepository } from "../adapters/gitRepository.js";
import { assertSafeRoot, assertContainedNoLinks, isSensitiveName, MAX_ENTRIES } from "./safety.js";

const PROJECT_MARKERS = new Set([".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json", "deno.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"]);
const EXCLUDED_DIRS = new Set([".git", ".claude", ".codex", ".cursor", ".gemini", ".opencode", ".worktrees", "worktrees", "node_modules", ".next", "dist", "build", "out", "target", "vendor", ".venv", "venv", "coverage", ".cache"]);
const MAX_DISCOVERY_DEPTH = 5;

export async function discoverProject(cwd = process.cwd()) {
  const root = await assertSafeRoot(cwd);
  const currentRepository = await inspectGitRepository(root);
  if (currentRepository) return makeResult(root, [currentRepository], [{ relativePath: path.join(path.relative(root, currentRepository.root), ".git") || ".git", type: "git_metadata", detail: "git_metadata_only" }], "single_repository");

  const candidates = [];
  const repositories = new Map();
  const queue = [{ dir: root, depth: 0 }];
  let seen = 0;
  while (queue.length && seen < MAX_ENTRIES) {
    const { dir, depth } = queue.shift();
    const metadataPath = path.join(dir, ".git");
    let metadataStat = null;
    try { metadataStat = await lstat(metadataPath); } catch { /* This directory is not a repository. */ }
    if (metadataStat && !metadataStat.isSymbolicLink() && (metadataStat.isDirectory() || metadataStat.isFile())) {
      const repository = await inspectGitRepository(dir);
      if (repository) {
        if (!repositories.has(repository.identity)) repositories.set(repository.identity, repository);
        candidates.push({ relativePath: path.join(path.relative(root, dir), ".git"), type: "git_metadata", detail: "git_metadata_only" });
      }
    }
    if (depth >= MAX_DISCOVERY_DEPTH) continue;
    let names;
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      if (++seen > MAX_ENTRIES) break;
      if (isSensitiveName(name)) continue;
      const full = path.join(dir, name);
      try { await assertContainedNoLinks(root, full); } catch { continue; }
      let st;
      try { st = await lstat(full); } catch { continue; }
      if (PROJECT_MARKERS.has(name) && name !== ".git") candidates.push({ relativePath: path.relative(root, full), type: "project_metadata", detail: "name_detected_only" });
      if (st.isDirectory() && !st.isSymbolicLink() && !EXCLUDED_DIRS.has(name.toLowerCase())) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  const found = [...repositories.values()].sort((a, b) => a.primaryRoot.localeCompare(b.primaryRoot));
  return makeResult(root, found, candidates, "repository_parent");
}

function makeResult(root, repositories, candidates, discoveryMode) {
  return {
    root,
    repositories,
    inventory: {
      projectRoot: root,
      discoveryMode,
      rootKind: repositories.length ? "git_repository_detected" : "directory_selected",
      repositories: repositories.map(repository => ({
        relativePath: path.relative(root, repository.primaryRoot) || ".",
        displayName: path.basename(repository.primaryRoot).slice(0, 120) || "Selected project",
        linkedWorktreeCount: Math.max(0, repository.worktrees.length - 1),
      })),
      scanLimits: { maxDepth: MAX_DISCOVERY_DEPTH, maxEntries: MAX_ENTRIES },
      candidates,
      contentsParsed: false,
      agentWorktreeDirectoriesExcluded: true,
    },
  };
}
