import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { stableLocalProjectId } from "../storage/localStore.js";

const execFileAsync = promisify(execFile);
const MAX_COMMITS = 2_000;
const MAX_BUFFER = 8 * 1024 * 1024;
const COMMIT_LINE = /^([0-9a-f]{40,64})\0(\d{4}-\d\d-\d\dT[^\0]+)\0(.*)$/;

export async function analyzeGitProject(candidateRoot) {
  const root = await realpath(candidateRoot);
  const stat = await lstat(path.join(root, ".git"));
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Chronicle supports standard repositories with an in-project .git directory; linked worktrees are not read.");
  }

  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_PAGER: "cat",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
  };
  const args = ["--no-replace-objects", "-C", root, "-c", "core.pager=cat", "-c", "core.fsmonitor=false", "-c", "diff.external=", "-c", "core.attributesFile=/dev/null", "log", `-${MAX_COMMITS}`, "--no-ext-diff", "--no-textconv", "--no-renames", "--format=%H%x00%aI%x00%P", "--numstat"];
  let stdout;
  try {
    ({ stdout } = await execFileAsync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER, timeout: 20_000, windowsHide: true, env }));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Git is required for Git history analysis. Install Git for Windows and try again.");
    if (error.killed || error.code === "ETIMEDOUT") throw new Error("Git history analysis exceeded its time limit.");
    throw new Error("Chronicle could not read this repository's Git metadata.");
  }

  const commits = new Map();
  const categories = new Map();
  let active = null;
  let insertions = 0;
  let deletions = 0;
  let fileChanges = 0;
  let mergeCommitCount = 0;
  for (const line of stdout.split(/\r?\n/)) {
    const commitMatch = line.match(COMMIT_LINE);
    if (commitMatch) {
      if (commits.size >= MAX_COMMITS) break;
      const id = createHash("sha256").update(commitMatch[1]).digest("hex");
      active = { id, date: new Date(commitMatch[2]).toISOString() };
      if (commitMatch[3].trim().split(/\s+/).filter(Boolean).length > 1) mergeCommitCount++;
      commits.set(id, active);
      continue;
    }
    if (!active) continue;
    const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (!match) continue;
    fileChanges++;
    if (match[1] !== "-") insertions += Number(match[1]);
    if (match[2] !== "-") deletions += Number(match[2]);
    const rawPath = line.slice(line.lastIndexOf("\t") + 1);
    const extension = path.extname(rawPath).toLowerCase();
    const category = categoryFor(extension, rawPath);
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }

  let branches = [];
  try {
    const result = await execFileAsync("git", ["-C", root, "-c", "core.pager=cat", "branch", "--format=%(refname:short)"], { encoding: "utf8", maxBuffer: 256 * 1024, timeout: 5_000, windowsHide: true, env });
    branches = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 200);
  } catch { /* Branch names are optional metadata. */ }

  const days = new Map();
  for (const commit of commits.values()) {
    const day = commit.date.slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  const dates = [...days.keys()].sort();
  const projectName = path.basename(root).slice(0, 120) || "Selected project";
  return {
    schemaVersion: 2,
    reportId: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceAvailability: { git: "implemented", agentSessions: "not_implemented", ide: "not_implemented", testRuns: "not_implemented", buildRuns: "not_implemented", ciRuns: "not_implemented" },
    project: {
      localProjectId: await stableLocalProjectId(root),
      displayName: projectName,
      association: "exact_root",
    },
    git: {
      evidenceClass: "git_activity",
      authorship: "unknown",
      commitCount: commits.size,
      fileChanges,
      insertions,
      deletions,
      currentBranchCount: branches.length,
      mergeCommitCount,
      activityByDay: dates.map((day) => ({ day, commits: days.get(day) })),
      fileCategories: [...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, changes]) => ({ category, changes })),
      commitIds: [...commits.keys()],
      historyTruncated: commits.size === MAX_COMMITS,
    },
    developmentStory: commits.size
      ? `Git records ${commits.size} commits and ${fileChanges} file changes for ${projectName}. This is repository activity; Git metadata alone does not establish who authored the work or whether an AI agent contributed.`
      : `No Git commits were available in the selected repository. Chronicle cannot infer manual or AI contribution from an empty history.`,
    contribution: { manual: "unknown", aiAssisted: "unknown", collaborative: "unknown", unclassified: "git_activity_only" },
    dimensions: ["planning", "technical_understanding", "verification", "steering", "coordination"].map((key) => ({ key, score: null, status: "insufficient_evidence", evidence: [] })),
    agents: { sessions: [], sourceCoverage: [], metrics: { sessionCount: 0, sourceCounts: {}, modelCounts: {}, averagePromptWords: null, planningSignals: 0, correctionSignals: 0, toolCalls: 0, toolCounts: {}, longestSessionSeconds: null, sessionsWithDuration: 0, maxConcurrentSessions: 0, failureSignals: 0, recoverySignals: 0, sessionDays: 0, gitCommitsOnSessionDays: 0, overlappingGitDays: 0, correlationNote: "Date overlap is temporal context only. It does not attribute commits or changes to a person or agent." }, claim: "No supported, repository-associated session records were included. An installed agent is not evidence of use." },
    privacy: { rawSourceCodeIncluded: false, rawDiffsIncluded: false, commitMessagesIncluded: false, authorIdentitiesIncluded: false, absoluteProjectPathIncluded: false, rawAgentTranscriptsIncluded: false, rawPromptTextIncluded: false, rawToolOutputIncluded: false },
  };
}

function categoryFor(extension, rawPath) {
  const file = rawPath.toLowerCase();
  if (/\.(test|spec)\.[^/.]+$/.test(file) || /(^|\/)(test|tests|__tests__)(\/|$)/.test(file)) return "test";
  if ([".yml", ".yaml"].includes(extension) && file.includes(".github/workflows/")) return "ci";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt"].includes(extension)) return "implementation";
  if ([".md", ".mdx", ".rst", ".txt"].includes(extension)) return "documentation";
  if ([".json", ".toml", ".yaml", ".yml", ".ini"].includes(extension)) return "configuration";
  return "other";
}

