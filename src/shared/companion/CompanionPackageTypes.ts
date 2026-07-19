/** Shared between renderer (builds the export payload from a CompanionProfile) and main (CompanionPackageFormat.ts actually writes/reads the .paw zip). */
export type CompanionPackageInput = {
  config: Record<string, unknown>;
  voice: Record<string, unknown>;
  personality: Record<string, unknown>;
  memory: Record<string, unknown>;
  /** The real original 3D file to embed, if this companion has one (uploaded companions only — quick/studio photo companions have no generated mesh yet). Never modified, only copied. */
  avatarFilePath?: string;
  /** Data URL (e.g. "data:image/png;base64,...") — decoded into thumbnail.png when present. */
  thumbnailDataUrl?: string;
};

export type ImportedCompanionPackage = {
  config: Record<string, unknown>;
  voice: Record<string, unknown>;
  personality: Record<string, unknown>;
  memory: Record<string, unknown>;
  /** Path to the extracted avatar file, persisted under userData (not a temp path) — present only if the package included one. */
  avatarFilePath?: string;
  thumbnailDataUrl?: string;
};
