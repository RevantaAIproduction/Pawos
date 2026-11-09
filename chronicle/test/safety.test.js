import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, symlink, writeFile, readFile, rm } from "node:fs/promises";
import { assertContainedNoLinks, assertSafeRoot, isSensitiveName } from "../src/discovery/safety.js";
import { discoverProject } from "../src/discovery/projectDiscovery.js";
import { makePreview } from "../src/application/preview.js";

test("sensitive names are excluded", () => {
  for (const name of [".env", ".env.production", "id_rsa", "private.pem", "credentials.json"]) assert.equal(isSensitiveName(name), true, name);
  assert.equal(isSensitiveName("package.json"), false);
});

test("project discovery reports names only and preserves files", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chronicle-sample-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), '{"scripts":{"test":"echo SHOULD_NOT_RUN"}}');
  await writeFile(path.join(root, ".env"), "SENTINEL_SECRET=do-not-read");
  const before = await readFile(path.join(root, "package.json"), "utf8");
  const result = await discoverProject(root);
  assert.equal(result.inventory.contentsParsed, false);
  assert.ok(result.inventory.candidates.some(x => x.relativePath === "package.json"));
  assert.ok(!result.inventory.candidates.some(x => x.relativePath === ".env"));
  assert.equal(await readFile(path.join(root, "package.json"), "utf8"), before);
});

test("preview is local and external contents remain uninspected", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chronicle-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const preview = await makePreview(root);
  assert.equal(preview.networkUsed, false);
  assert.equal(preview.consent.externalContentsRead, false);
  assert.ok(preview.externalSources.every(s => s.contentsInspected === false && s.approvalRequired === true));
});

test("symlink roots and traversal are denied", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chronicle-links-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "chronicle-outside-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await mkdir(path.join(root, "safe"));
  await symlink(outside, path.join(root, "escape"), "junction").catch(async () => symlink(outside, path.join(root, "escape"), "dir"));
  await assert.rejects(assertContainedNoLinks(root, path.join(root, "escape", "secret.json")), /symbolic_link_traversal_denied/);
  await assert.rejects(assertContainedNoLinks(root, path.join(outside, "secret.json")), /path_outside_approved_root/);
  assert.equal((await assertSafeRoot(root)).toLowerCase(), root.toLowerCase());
});
