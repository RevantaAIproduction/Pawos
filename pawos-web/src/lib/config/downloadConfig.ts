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
 * Every installer URL is read from an env var and defaults to null. A
 * variant is only ever "available" when a real URL is actually configured —
 * this file is the one place that changes when production storage (R2, GCS,
 * S3, etc.) is ready. The UI never hardcodes "Ready" independent of this.
 */
function variant(id: string, label: string, envUrl: string | undefined): DownloadVariant {
  const url = envUrl && envUrl.trim().length > 0 ? envUrl.trim() : null;
  return { id, label, status: url ? "available" : "comingSoon", url };
}

export function getDownloadPlatforms(): DownloadPlatform[] {
  return [
    {
      id: "windows",
      label: "Windows",
      variants: [
        variant("windows-x64", "Windows x64 (.exe)", process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_X64_URL),
        variant("windows-arm64", "Windows ARM64 (.exe)", process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS_ARM64_URL),
      ],
    },
    {
      id: "macos",
      label: "macOS",
      variants: [
        variant("macos-apple-silicon", "Apple Silicon (M-series)", process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_ARM64_URL),
        variant("macos-intel", "Intel Macs", process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_X64_URL),
      ],
    },
    {
      id: "linux",
      label: "Linux",
      variants: [
        variant("linux-appimage", "AppImage", process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_APPIMAGE_URL),
        variant("linux-deb", "DEB package", process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_DEB_URL),
        variant("linux-rpm", "RPM package", process.env.NEXT_PUBLIC_DOWNLOAD_LINUX_RPM_URL),
      ],
    },
  ];
}

export function getDownloadPlatform(id: DownloadPlatformId): DownloadPlatform {
  const platform = getDownloadPlatforms().find((p) => p.id === id);
  if (!platform) throw new Error(`Unknown download platform: ${id}`);
  return platform;
}
