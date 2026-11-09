import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

const SENSITIVE_NAMES = /^(\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials?(?:\.json)?|secrets?(?:\.ya?ml|\.json)?|id_(?:rsa|ed25519)|[^/\\]*\.(?:pem|key|p12|pfx))$/i;
export const MAX_DEPTH = 3;
export const MAX_ENTRIES = 2_000;

export function isSensitiveName(name) { return SENSITIVE_NAMES.test(name); }

export async function assertSafeRoot(candidate) {
  const abs = path.resolve(candidate);
  const parsed = path.parse(abs);
  let current = parsed.root;
  for (const part of abs.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const st = await lstat(current);
    if (st.isSymbolicLink()) throw new Error("symbolic_link_root_denied");
  }
  const st = await lstat(abs);
  if (!st.isDirectory()) throw new Error("root_not_directory");
  const canonical = await realpath(abs);
  if (canonical.toLowerCase() !== abs.toLowerCase()) throw new Error("noncanonical_root_denied");
  return canonical;
}

export async function assertContainedNoLinks(root, candidate) {
  const absRoot = path.resolve(root), absCandidate = path.resolve(candidate);
  const relative = path.relative(absRoot, absCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("path_outside_approved_root");
  let current = absRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let st;
    try { st = await lstat(current); } catch (error) { if (error.code === "ENOENT") break; throw error; }
    if (st.isSymbolicLink()) throw new Error("symbolic_link_traversal_denied");
    const resolved = await realpath(current);
    const rel = path.relative(absRoot, resolved);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error("path_escape_denied");
  }
  return absCandidate;
}
