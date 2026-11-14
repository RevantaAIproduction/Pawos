import path from "node:path";
import { discoverProject } from "../discovery/projectDiscovery.js";
import { outsideProjectSourceOptions } from "../discovery/externalSources.js";
import { discoverProjectSources } from "../discovery/projectSources.js";

export async function makePreview(cwd = process.cwd()) {
  const project = await discoverProject(cwd);
  const roots = project.repositories.length ? project.repositories.map((repository) => ({ relativePath: path.relative(project.root, repository.primaryRoot) || ".", root: repository.primaryRoot })) : [{ relativePath: ".", root: project.root }];
  const projectSources = await Promise.all(roots.map(async (item) => ({ relativePath: item.relativePath, discovery: await discoverProjectSources(item.root) })));
  const externalSources = outsideProjectSourceOptions();
  return { product: "PawOS Chronicle", mode: "local_only", project: project.inventory, projectSources, externalSources, consent: { projectSelectedByUser: true, projectLocalContentsRead: false, externalContentsRead: false, externalApprovalRequiredPerExactPath: true }, networkUsed: false };
}
