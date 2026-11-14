import path from "node:path";
import { lstat, readdir, realpath } from "node:fs/promises";
import { AGENT_ADAPTERS, detectedFormat } from "../adapters/registry.js";
import { assertContainedNoLinks, assertSafeRoot, isSensitiveName } from "./safety.js";

const EXCLUDED_DIRS = new Set([".git", "node_modules", ".next", ".cache", "cache", "dist", "build", "out", "target", "vendor", ".venv", "venv", "coverage", "artifacts", "release-artifacts"]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 4_000;
const MAX_ACTIVITY_FILES = 1_000;
const ACTIVITY_EXTENSIONS = new Set([".jsonl", ".ndjson", ".sqlite", ".sqlite3", ".db", ".log"]);
const genericActivityPath = /(?:^|\/)(?:\.agents?|agents?|ai[-_]?sessions?|agent[-_]?sessions?|sessions|tasks)(?:\/|$)/i;
const slash = (value) => value.replaceAll("\\", "/");
const isAtOrBelow = (candidate, marker) => candidate === marker || candidate.startsWith(marker.replace(/\/$/, "") + "/");

/** Project-root-only inventory. It reads names and filesystem metadata, never file contents. */
export async function discoverProjectSources(projectRoot, { maxEntries = MAX_ENTRIES, maxActivityFiles = MAX_ACTIVITY_FILES } = {}) {
  const root = await assertSafeRoot(projectRoot);
  const adapters = new Map(AGENT_ADAPTERS.map((item) => [item.id, { ...item, configurationMarkers: new Set(), activityMarkersFound: new Set(), activityFiles: [] }]));
  const genericActivity = [];
  const queue = [{ dir: root, depth: 0 }];
  let seen = 0, inspectedActivityFiles = 0, scanTruncated = false;

  while (queue.length) {
    const current = queue.shift();
    let names;
    try { names = await readdir(current.dir); } catch { continue; }
    for (const name of names) {
      if (++seen > maxEntries) { scanTruncated = true; break; }
      if (isSensitiveName(name)) continue;
      const full = path.join(current.dir, name);
      const relative = slash(path.relative(root, full));
      try { await assertContainedNoLinks(root, full); } catch { continue; }
      let stat;
      try { stat = await lstat(full); } catch { continue; }
      if (stat.isSymbolicLink()) continue;

      const lower = relative.toLowerCase();
      for (const adapter of adapters.values()) {
        for (const marker of adapter.markers) if (isAtOrBelow(lower, marker.toLowerCase())) adapter.configurationMarkers.add(marker);
        for (const marker of adapter.activityMarkers || []) if (isAtOrBelow(lower, marker.toLowerCase())) adapter.activityMarkersFound.add(marker);
        if (stat.isFile() && (adapter.activityMarkers || []).some((marker) => isAtOrBelow(lower, marker.toLowerCase()))) {
          if (inspectedActivityFiles < maxActivityFiles) {
            const supportsProjectFile = adapter.id === "aider" && relative.toLowerCase() === ".aider.chat.history.md";
            adapter.activityFiles.push({ path: relative, format: detectedFormat(relative), sizeBytes: stat.size, parserStatus: supportsProjectFile ? "project_local_supported" : adapter.parser === "external_only" ? "external_store_only" : "detection_only" });
            inspectedActivityFiles++;
          } else scanTruncated = true;
        }
      }

      if (stat.isFile() && ACTIVITY_EXTENSIONS.has(path.extname(name).toLowerCase()) && genericActivityPath.test(lower) && ![...adapters.values()].some((adapter) => adapter.activityFiles.some((item) => item.path === relative))) {
        if (inspectedActivityFiles < maxActivityFiles) {
          genericActivity.push({ path: relative, format: detectedFormat(relative), sizeBytes: stat.size, classification: "unidentified_project_activity_store", parserStatus: "unsupported" });
          inspectedActivityFiles++;
        } else scanTruncated = true;
      }

      if (stat.isDirectory() && current.depth < MAX_DEPTH && !EXCLUDED_DIRS.has(name.toLowerCase())) {
        // Claude worktrees contain checked-out source trees; they are excluded from this inventory.
        if (lower === ".claude/worktrees") continue;
        const resolved = await realpath(full).catch(() => null);
        if (!resolved) continue;
        const contained = path.relative(root, resolved);
        if (contained === ".." || contained.startsWith(`..${path.sep}`) || path.isAbsolute(contained)) continue;
        queue.push({ dir: full, depth: current.depth + 1 });
      }
    }
    if (scanTruncated) break;
  }

  const detectedAgents = [...adapters.values()].filter((item) => item.configurationMarkers.size || item.activityMarkersFound.size).map((item) => ({
    adapterId: item.id,
    label: item.label,
    detection: item.detection,
    configurationDetected: item.configurationMarkers.size > 0,
    configurationMarkers: [...item.configurationMarkers].sort(),
    activitySourceDetected: item.activityMarkersFound.size > 0 || item.activityFiles.length > 0,
    activityMarkers: [...item.activityMarkersFound].sort(),
    activityFiles: item.activityFiles.sort((a, b) => a.path.localeCompare(b.path)),
    behavioralAnalysis: item.parser === "detection_only" ? "not_supported" : item.parser === "project_local" ? "project_local_chat_history_supported" : "external_session_adapter_only",
    usageEvidence: "not_established_by_project_markers",
  }));

  return {
    schemaVersion: 1,
    scope: "selected_project_only",
    projectRoot: root,
    detectedAgents,
    unidentifiedActivitySources: genericActivity.sort((a, b) => a.path.localeCompare(b.path)),
    discoveryLimits: { maxDepth: MAX_DEPTH, maxEntries, maxActivityFiles, entriesInspected: Math.min(seen, maxEntries), activityFilesInspected: inspectedActivityFiles, truncated: scanTruncated },
    contentsRead: false,
    symlinksFollowed: false,
  };
}
