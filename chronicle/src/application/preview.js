import { discoverProject } from "../discovery/projectDiscovery.js";
import { inventoryExternalLocations } from "../discovery/externalSources.js";

export async function makePreview(cwd = process.cwd()) {
  const project = await discoverProject(cwd);
  const externalSources = await inventoryExternalLocations();
  return { product: "PawOS Chronicle", mode: "local_only", project: project.inventory, externalSources, consent: { projectSelectedByUser: true, externalContentsRead: false, externalApprovalRequiredPerExactPath: true }, networkUsed: false };
}
