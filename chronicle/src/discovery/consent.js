import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertSafeRoot } from "./safety.js";
import { loadManifest, saveManifest } from "../storage/localStore.js";

export async function approveExactSource(sourcePath, sourceId, projectRoot) {
  const root = await assertSafeRoot(sourcePath);
  const manifest = await loadManifest();
  const key = `${path.resolve(projectRoot)}\0${root}`;
  manifest.grants[key] = { grantId: randomUUID(), projectPath: path.resolve(projectRoot), sourcePath: root, sourceId, purpose: "local_evidence_inventory", approvedAt: new Date().toISOString(), revoked: false };
  await saveManifest(manifest);
  return manifest.grants[key];
}

export async function listGrants() {
  const manifest = await loadManifest();
  return Object.values(manifest.grants).filter(g => !g.revoked);
}
