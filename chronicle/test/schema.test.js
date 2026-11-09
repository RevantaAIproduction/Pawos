import test from "node:test";
import assert from "node:assert/strict";
import { validateEvent } from "../src/domain/schema.js";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { appendEvents, loadManifest, saveManifest, storageStatus } from "../src/storage/localStore.js";

const valid = { schemaVersion: 1, eventId: "x", projectId: "p1", projectAssociation: "exact_root", source: { adapterId: "project-config", adapterVersion: "1.0.0", sourceFingerprint: "h1" }, kind: "project_detected", actor: { kind: "unknown", confidence: "low" }, evidence: { classification: "configuration", basis: ["marker_name"] }, privacy: { containsRawText: false, containsAbsolutePath: false, containsSecretMaterial: false } };
test("valid normalized event passes", () => assert.deepEqual(validateEvent(valid), { ok: true }));
test("unsupported, malformed, private, and oversized events fail safely", () => {
  assert.equal(validateEvent({ ...valid, schemaVersion: 2 }).reason, "unsupported_schema_version");
  assert.equal(validateEvent({ ...valid, privacy: { containsRawText: true, containsAbsolutePath: false, containsSecretMaterial: false } }).reason, "privacy_invariant_failed");
  assert.equal(validateEvent({ ...valid, evidence: { classification: "guess", basis: [] } }).reason, "invalid_evidence");
  assert.equal(validateEvent({ ...valid, rawTranscript: "secret" }).reason, "unknown_or_sensitive_field");
  assert.equal(validateEvent({ ...valid, eventId: "x", padding: "a".repeat(17_000) }).reason, "event_too_large");
  assert.equal(validateEvent(null).reason, "event_not_object");
});

test("local storage writes atomically within bounds and round-trips manifest", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "chronicle-store-"));
  const old = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = temp;
  t.after(async () => { if (old === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = old; await rm(temp, { recursive: true, force: true }); });
  const manifest = { version: 1, grants: { sample: { grantId: "g1", sourcePath: "C:\\approved", purpose: "local_evidence_inventory" } } };
  await saveManifest(manifest);
  assert.deepEqual(await loadManifest(), manifest);
  const before = await storageStatus();
  assert.equal(before.exists, false);
  await assert.rejects(appendEvents([{ ...valid, eventId: "bad", privacy: { containsRawText: true, containsAbsolutePath: false, containsSecretMaterial: false } }]), /invalid_event/);
  assert.equal((await storageStatus()).exists, false);
  const stored = await appendEvents([valid]);
  assert.equal(stored.eventCount, 1);
  assert.equal((await storageStatus()).exists, true);
  await assert.rejects(saveManifest({ version: 1, grants: Object.fromEntries(Array.from({ length: 513 }, (_, i) => [String(i), {}])) }), /too_many_grants/);
});
