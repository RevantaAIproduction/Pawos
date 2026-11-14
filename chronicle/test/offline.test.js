import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../src");
async function walk(folder) {
  const files = [];
  for (const ent of await readdir(folder, { withFileTypes: true })) {
    const target = path.join(folder, ent.name);
    if (ent.isDirectory()) files.push(...await walk(target));
    else if (target.endsWith(".js")) files.push(target);
  }
  return files;
}

test("runtime dependency graph uses filesystem/local Node built-ins only", async () => {
  for (const file of await walk(src)) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)/g)) {
      const spec = match[1];
      assert.ok(spec.startsWith(".") || spec.startsWith("node:"), `${path.basename(file)} imports ${spec}`);
      assert.ok(!["node:http", "node:https", "node:net", "node:dns", "node:tls"].includes(spec), `${path.basename(file)} has network dependency`);
    }
  }
});

test("CLI preview runs without network/setup and returns local-only inventory", () => {
  const result = spawnSync(process.execPath, [path.join(src, "cli.js"), "preview"], { cwd: here, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.mode, "local_only");
  assert.equal(preview.networkUsed, false);
  assert.equal(preview.project.inventory, undefined);
  assert.equal(preview.consent.externalContentsRead, false);
  assert.ok(Array.isArray(preview.projectSources));
  assert.ok(preview.projectSources.every((entry) => entry.discovery.scope === "selected_project_only" && entry.discovery.contentsRead === false));
  assert.ok(preview.externalSources.every((source) => source.status === "not_inspected" && source.availabilityChecked === false && source.contentsInspected === false));
});
