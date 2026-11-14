import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { assertContainedNoLinks, assertSafeRoot } from "./safety.js";
import { loadManifest, saveManifest } from "../storage/localStore.js";

export async function approveExactSource(sourcePath, sourceId, projectRoot, projectId = null) {
  const root = await assertSafeRoot(sourcePath);
  const selectedProject = await realpath(projectRoot);
  const manifest = await loadManifest();
  const identity = typeof projectId === "string" && /^[a-f0-9]{64}$/.test(projectId) ? projectId : selectedProject.toLowerCase();
  const key = `${identity}\0${sourceId}\0${root}`;
  manifest.grants[key] = { grantId: randomUUID(), projectId: identity, projectPath: selectedProject, sourcePath: root, sourceId, purpose: "local_evidence_inventory", approvedAt: new Date().toISOString(), revoked: false };
  await saveManifest(manifest);
  return manifest.grants[key];
}

export async function approveExactProjectFile(sourcePath, sourceId, projectRoot, projectId = null) {
  const selectedProject = await assertSafeRoot(projectRoot);
  const candidate = await assertContainedNoLinks(selectedProject, sourcePath);
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("approved_project_source_must_be_regular_file");
  const canonical = await realpath(candidate);
  if (canonical.toLowerCase() !== candidate.toLowerCase()) throw new Error("approved_project_source_noncanonical_path");
  const manifest = await loadManifest();
  const identity = typeof projectId === "string" && /^[a-f0-9]{64}$/.test(projectId) ? projectId : selectedProject.toLowerCase();
  const key = `${identity}\0${sourceId}\0${canonical}`;
  manifest.grants[key] = { grantId: randomUUID(), projectId: identity, projectPath: selectedProject, sourcePath: canonical, sourceId, purpose: "local_project_session_parse", approvedAt: new Date().toISOString(), revoked: false };
  await saveManifest(manifest);
  return manifest.grants[key];
}

export async function hasExactSourceGrant(sourcePath, sourceId, projectId, projectRoot) {
  let source, project;
  try { source = await realpath(sourcePath); project = await realpath(projectRoot); } catch { return false; }
  const grants = await listGrants();
  return grants.some(grant => {
    if (grant.sourceId !== sourceId || typeof grant.sourcePath !== "string" || path.resolve(grant.sourcePath).toLowerCase() !== source.toLowerCase()) return false;
    if (grant.projectId && projectId) return grant.projectId === projectId;
    return typeof grant.projectPath === "string" && path.resolve(grant.projectPath).toLowerCase() === project.toLowerCase();
  });
}

export async function listGrants() {
  const manifest = await loadManifest();
  return Object.values(manifest.grants).filter(g => !g.revoked);
}
