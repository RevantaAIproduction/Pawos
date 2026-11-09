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
