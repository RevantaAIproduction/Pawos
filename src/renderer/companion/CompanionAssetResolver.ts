export function getCompanionResourceBaseUrl(petAssetsDirUrl: string) {
  // base: .../assets/pets/{petId}
  return petAssetsDirUrl.replace(/\\/g, '/');
}

export { getCompanionResourceBaseUrl as getPetResourceBaseUrl };

