import { supportedSessionSources, previewSessionSource } from "../adapters/sessions.js";

export function suggestedExternalLocations(env = process.env, platform = process.platform) {
  return supportedSessionSources(env, platform);
}

export async function inventoryExternalLocations(locations = suggestedExternalLocations()) {
  return Promise.all(locations.map(async (item) => ({
    ...(await previewSessionSource(item)),
    contentsInspected: false,
    approvalRequired: true,
  })));
}

// Describes known external adapter options without checking whether their
// machine-wide paths exist or enumerating their contents.
export function outsideProjectSourceOptions(locations = suggestedExternalLocations()) {
  return locations.map((item) => ({
    sourceId: item.sourceId,
    adapterId: item.adapterId,
    path: item.path,
    location: item.location,
    scope: "outside_project",
    status: "not_inspected",
    contentsInspected: false,
    availabilityChecked: false,
    approvalRequired: true,
  }));
}
