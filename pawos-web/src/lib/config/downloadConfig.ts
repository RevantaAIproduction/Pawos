export type DownloadStatus = "available" | "comingSoon";

export type DownloadVariant = {
  id: string;
  label: string;
  status: DownloadStatus;
  /** Real URL to production storage/CDN. Null until one is configured — never fabricated. */
  url: string | null;
};

export type DownloadPlatformId = "windows" | "macos" | "linux";

export type DownloadPlatform = {
  id: DownloadPlatformId;
  label: string;
  variants: DownloadVariant[];
};

/**
 * Public installers are intentionally held until launch. Environment URLs may
 * exist for release preparation, but the website must not expose any build yet.
 */
function variant(id: string, label: string): DownloadVariant {
  return { id, label, status: "comingSoon", url: null };
}

export function getDownloadPlatforms(): DownloadPlatform[] {
  return [
    {
      id: "windows",
      label: "Windows",
      variants: [
        variant("windows-x64", "Windows x64 (.exe)"),
        variant("windows-arm64", "Windows ARM64 (.exe)"),
      ],
    },
    {
      id: "macos",
      label: "macOS",
      variants: [
        variant("macos-apple-silicon", "Apple Silicon (M-series)"),
        variant("macos-intel", "Intel Macs"),
      ],
    },
    {
      id: "linux",
      label: "Linux",
      variants: [
        variant("linux-appimage", "AppImage"),
        variant("linux-deb", "DEB package"),
        variant("linux-rpm", "RPM package"),
      ],
    },
  ];
}

export function getDownloadPlatform(id: DownloadPlatformId): DownloadPlatform {
  const platform = getDownloadPlatforms().find((p) => p.id === id);
  if (!platform) throw new Error(`Unknown download platform: ${id}`);
  return platform;
}
