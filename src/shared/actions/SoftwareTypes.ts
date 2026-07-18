export type SoftwareManager = 'winget' | 'npm' | 'pip' | 'code-extension';

/** Generic across any package for a given manager — no per-application data, just each manager's own "is X installed" query. */
export type SoftwareDetectionResult = {
  installed: boolean;
  version?: string;
  raw?: string;
};

export type SoftwareVerification = {
  executableChecked?: string;
  executableFound?: boolean;
  versionOutput?: string;
  launchChecked?: string;
  launchConfirmed?: boolean;
  detectedAfter?: SoftwareDetectionResult;
};

export type SoftwareOperationReport = {
  operation: 'install' | 'update' | 'uninstall' | 'repair';
  manager: SoftwareManager;
  packageId: string;
  detectedBefore: SoftwareDetectionResult;
  commandsRun: string[];
  verification: SoftwareVerification;
  recoveryAttempted: boolean;
};
