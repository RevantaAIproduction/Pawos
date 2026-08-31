/** Portable project identity — UUID-based, organization-scoped (or personal if organization_id is null). */
export type OrgProject = {
  id: string;
  /** Organization ID (null for personal projects). */
  organizationId: string | null;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Device-specific local path binding for a project. Same project can exist on multiple devices with different paths. */
export type ProjectUserDeviceAttachment = {
  id: string;
  projectId: string;
  userId: string;
  /** From DeviceIdentityStore.deviceId (never client-supplied). */
  deviceId: string;
  /** Absolute filesystem path to this project's checkout on this device. */
  localPath: string;
  /** True if folder existence, git metadata, and structure have been verified. */
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCreationInput = {
  name: string;
  organizationId: string | null;
};

export type ProjectAttachmentInput = {
  projectId: string;
  localPath: string;
};
