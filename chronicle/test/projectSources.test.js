import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { discoverProjectSources } from "../src/discovery/projectSources.js";
import { outsideProjectSourceOptions } from "../src/discovery/externalSources.js";
import { AGENT_ADAPTERS } from "../src/adapters/registry.js";

test("discovers project-local tool markers without reading configuration or activity contents", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-project-sources-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, ".cursor", "rules"), { recursive: true });
  await writeFile(path.join(temp, ".cursor", "rules", "agent.mdc"), "PRIVATE_CONFIG_TEXT");
  await mkdir(path.join(temp, ".windsurf"), { recursive: true });
  await writeFile(path.join(temp, ".windsurf", "hooks.json"), JSON.stringify({ hooks: { post_cascade_response_with_transcript: [] } }));
  await mkdir(path.join(temp, ".claude"), { recursive: true });
  await writeFile(path.join(temp, ".claude", "settings.json"), "PRIVATE_TOKEN_CONTENT");
  await writeFile(path.join(temp, ".clinerules"), "PRIVATE_CLINE_CONFIG");
  await mkdir(path.join(temp, ".cline", "sessions"), { recursive: true });
  await writeFile(path.join(temp, ".cline", "sessions", "sample.jsonl"), "RAW_SESSION_CONTENT");
  await mkdir(path.join(temp, ".agents", "runtime"), { recursive: true });
  await writeFile(path.join(temp, ".agents", "runtime", "activity.ndjson"), "UNKNOWN_AGENT_PRIVATE_CONTENT");
  await writeFile(path.join(temp, ".aider.chat.history.md"), "#### PRIVATE_AIDER_HISTORY_CONTENT");

  const result = await discoverProjectSources(temp);
  const cursor = result.detectedAgents.find((item) => item.adapterId === "cursor");
  const windsurf = result.detectedAgents.find((item) => item.adapterId === "windsurf");
  const cline = result.detectedAgents.find((item) => item.adapterId === "cline");
  const aider = result.detectedAgents.find((item) => item.adapterId === "aider");
  assert.ok(cursor?.configurationDetected);
  assert.equal(cursor.activitySourceDetected, false);
  assert.ok(windsurf?.configurationDetected);
  assert.equal(windsurf.activitySourceDetected, false, "Windsurf hook configuration is not retained activity");
  assert.equal(cline?.configurationDetected, true);
  assert.equal(cline.activitySourceDetected, false, "global Cline sessions are not treated as project-local activity");
  assert.equal(aider.activityFiles[0].parserStatus, "project_local_supported");
  assert.equal(aider.activityFiles[0].format, "markdown");
  assert.equal(result.unidentifiedActivitySources[0].classification, "unidentified_project_activity_store");
  assert.equal(result.contentsRead, false);
  assert.equal(result.scope, "selected_project_only");
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CONFIG_TEXT|PRIVATE_TOKEN_CONTENT|RAW_SESSION_CONTENT|UNKNOWN_AGENT_PRIVATE_CONTENT|PRIVATE_AIDER_HISTORY_CONTENT|PRIVATE_CLINE_CONFIG/);
  assert.match(JSON.stringify(result), /not_established_by_project_markers/);
});

test("does not follow project symlinks outside the selected root", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "chronicle-project-boundary-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "project");
  const outside = path.join(parent, "outside");
  await mkdir(path.join(root, ".agents"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, "session.jsonl"), "OUTSIDE_RAW_CONTENT");
  let linkCreated = false;
  try { await symlink(outside, path.join(root, ".agents", "linked"), "junction"); linkCreated = true; }
  catch { try { await symlink(outside, path.join(root, ".agents", "linked"), "dir"); linkCreated = true; } catch { /* Some Windows runners cannot create symlinks without Developer Mode. */ } }
  if (!linkCreated) { t.skip("Symlink creation is not permitted in this Windows runner."); return; }
  const result = await discoverProjectSources(root);
  assert.deepEqual(result.detectedAgents, []);
  assert.deepEqual(result.unidentifiedActivitySources, []);
  assert.equal(JSON.stringify(result).includes("OUTSIDE_RAW_CONTENT"), false);
});

test("registry distinguishes broad detection from implemented behavioral parsing", () => {
  assert.ok(AGENT_ADAPTERS.length >= 12);
  assert.equal(AGENT_ADAPTERS.find((item) => item.id === "claude-code").parser, "external_only");
  assert.equal(AGENT_ADAPTERS.find((item) => item.id === "cursor").parser, "detection_only");
  assert.equal(AGENT_ADAPTERS.find((item) => item.id === "aider").parser, "project_local");
});

test("external store options are reported outside project scope without checking their availability", () => {
  const options = outsideProjectSourceOptions([{ adapterId: "codex", sourceId: "codex", path: "C:/outside/codex", location: "external" }]);
  assert.equal(options[0].status, "not_inspected");
  assert.equal(options[0].availabilityChecked, false);
  assert.equal(options[0].contentsInspected, false);
  assert.equal(options[0].approvalRequired, true);
});
