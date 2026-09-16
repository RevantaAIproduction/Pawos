export type LocalDeviceIdentity = {
  deviceId: string;
  deviceHash?: string;
  deviceName: string;
  platform: string;
};

/** A row from the cross-device `device_sessions` Supabase table — every device ever signed into this account. */
export type DeviceSessionRecord = {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};
