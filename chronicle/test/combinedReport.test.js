import test from "node:test";
import assert from "node:assert/strict";
import { renderDeveloperReport } from "../src/report/renderHtml.js";

test("combined developer overview deduplicates sessions and keeps project Git totals scoped", () => {
  const session = { sessionKey: "a".repeat(64), source: "codex" };
  const reports = [
    { project: { displayName: "frontend" }, git: { commitCount: 4, fileChanges: 9 }, agents: { sessions: [session], metrics: { sessionCount: 1, sourceCounts: { codex: 1 } } } },
    { project: { displayName: "backend" }, git: { commitCount: 5, fileChanges: 8 }, agents: { sessions: [session], metrics: { sessionCount: 1, sourceCounts: { codex: 1 } } } },
  ];
  const html = renderDeveloperReport(reports);
  assert.match(html, /combines 2 explicitly selected repositories/);
  assert.match(html, /1<\/b>deduplicated agent sessions/);
  assert.match(html, /<tr><td>frontend<\/td><td>4<\/td><td>9<\/td><td>1<\/td><\/tr>/);
  assert.equal(html.includes("a".repeat(64)), false);
});
