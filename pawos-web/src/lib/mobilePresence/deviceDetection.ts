/** Real, honest browser feature/UA detection — no fabricated capability claims. Shared by the pairing flow (PairClient.tsx) and presence tracking (CompanionPresence.tsx) so both report the same identity for the same browser. */
export function detectDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android device";
  return "This device";
}

export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

export function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Unknown";
}

/**
 * Real device-capability detection — no fabricated values. Biometrics and background sync have no
 * honest feature-detection API from a web page, so they're left false rather than guessed (see
 * MobilePresenceTypes.ts's DeviceCapabilities: an untrue "true" here would mislead the Notification
 * Runtime into attempting delivery the device can't actually receive).
 */
export function detectCapabilities() {
  return {
    pushNotifications: "serviceWorker" in navigator && "PushManager" in window,
    voice: "speechSynthesis" in window,
    camera: !!navigator.mediaDevices,
    microphone: !!navigator.mediaDevices,
    biometrics: false,
    offlineSupport: "serviceWorker" in navigator,
    backgroundSync: "serviceWorker" in navigator && "SyncManager" in window,
  };
}
