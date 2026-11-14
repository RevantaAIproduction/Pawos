import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeGitProject } from "../src/adapters/git.js";
import { analyzeApprovedSessionSource } from "../src/adapters/sessions.js";
import { attachSessionEvidence } from "../src/application/attachSessions.js";
import { buildDevelopmentStory } from "../src/analysis/developmentStory.js";
import { renderLocalReport } from "../src/report/renderHtml.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-demo-report-"));
const project = path.join(temp, "fixture-project");
const home = path.join(temp, "fixture-home");
const sessionDir = path.join(home, ".claude", "projects", "fixture");
const git = (...args) => {
  const result = spawnSync("git", ["-C", project, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git_fixture_failed");
};

try {
  await mkdir(project, { recursive: true });
  git("init", "-q");
  await writeFile(path.join(project, "README.md"), "Fixture project overview\n");
  await mkdir(path.join(project, "test"), { recursive: true });
  await writeFile(path.join(project, "test", "sample.test.js"), "// fixture test file\n");
  git("add", ".");
  git("-c", "user.name=Fixture Developer", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture setup");
  await writeFile(path.join(project, "README.md"), "Fixture project overview\nA second illustrative change.\n");
  git("add", "README.md");
  git("-c", "user.name=Fixture Developer", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture documentation update");

  await mkdir(sessionDir, { recursive: true });
  const sessionRows = [
    { type: "user", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:00:00.000Z", message: { content: "Plan a small change and verify it. DEMONSTRATION_PROMPT" } },
    { type: "assistant", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:01:00.000Z", message: { model: "claude-sonnet-fixture", content: [{ type: "tool_use", name: "Bash" }] } },
    { type: "user", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:02:00.000Z", message: { content: [{ type: "tool_result", is_error: true, content: "DEMONSTRATION_FAILURE_OUTPUT" }] } },
    { type: "user", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:03:00.000Z", message: { content: [{ type: "tool_result", is_error: false, content: "DEMONSTRATION_SUCCESS_OUTPUT" }] } },
    { type: "user", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:04:00.000Z", message: { content: "Actually, run the focused test first. DEMONSTRATION_CORRECTION" } },
    { type: "assistant", sessionId: "fixture-session-a", cwd: project, timestamp: "2026-11-08T10:06:00.000Z", message: { model: "claude-sonnet-fixture", content: [{ type: "tool_use", name: "Bash" }] } },
  ];
  await writeFile(path.join(sessionDir, "fixture-session.jsonl"), sessionRows.map(JSON.stringify).join("\n"));
  const report = await analyzeGitProject(project);
  const analyzed = await analyzeApprovedSessionSource({ adapterId: "claude-code", sourceId: "claude-code", path: path.join(home, ".claude", "projects") }, project, { projectId: report.project.localProjectId });
  const sessionResult = { ...analyzed, sourceId: "claude-code", estimatedFiles: analyzed.filesDiscovered };
  attachSessionEvidence(report, [sessionResult]);
  report.project.displayName = "Demo Fixture Project";
  report.developmentStory = buildDevelopmentStory(report);
  const sanitizedReport = {
    ...report,
    git: Object.fromEntries(Object.entries(report.git).filter(([key]) => key !== "episodeCommitEvidence")),
    agents: { ...report.agents, sessions: report.agents.sessions.map(({ events, timelineAnalysis, taskReferenceHashes, branchIdentity, fileReferenceHashes, relatedCommitReferences, explicitParentSessionId, explicitRelatedSessionIds, ...session }) => session) },
  };
  const serialized = JSON.stringify(sanitizedReport, null, 2);
  const html = renderLocalReport(report).replace("CHRONICLE / LOCAL REPORT", "CHRONICLE / DEMONSTRATION FIXTURE REPORT");
  if (/DEMONSTRATION_(?:PROMPT|FAILURE_OUTPUT|SUCCESS_OUTPUT|CORRECTION)/.test(serialized + html)) throw new Error("fixture_raw_text_leaked");
  await mkdir(here, { recursive: true });
  await writeFile(path.join(here, "demo-report.json"), serialized + "\n");
  await writeFile(path.join(here, "demo-report.html"), html);
  console.log(`Generated ${path.join(here, "demo-report.html")}`);
  console.log(`Generated ${path.join(here, "demo-report.json")}`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
