import type { CliDetectableConnector } from '../../../../shared/infrastructure/InfrastructureTypes';
import { execCli } from './execCli';

/**
 * Cloud/container connectors are deliberately thin detection probes, not SDK
 * wrappers — real operations run through the user's own installed,
 * authenticated CLI via RunCommandPlugin (see commandSafety.ts allowlist),
 * exactly like RunDeployScriptPlugin never invents deployment infrastructure.
 * Each `detect()` runs one real, read-only command and reports honestly.
 */

export class AwsCliConnector implements CliDetectableConnector {
  readonly id = 'aws' as const;
  readonly displayName = 'AWS';

  async detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }> {
    const version = await execCli('aws', ['--version']);
    if (!version.ok) return { installed: false, authenticated: false, detail: 'AWS CLI is not installed or not on PATH.' };
    const identity = await execCli('aws', ['sts', 'get-caller-identity']);
    return { installed: true, authenticated: identity.ok, detail: identity.ok ? identity.stdout : identity.stderr };
  }
}

export class GcpCliConnector implements CliDetectableConnector {
  readonly id = 'gcp' as const;
  readonly displayName = 'Google Cloud Platform';

  async detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }> {
    const version = await execCli('gcloud', ['--version']);
    if (!version.ok) return { installed: false, authenticated: false, detail: 'gcloud CLI is not installed or not on PATH.' };
    const account = await execCli('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']);
    const authenticated = account.ok && account.stdout.length > 0;
    return { installed: true, authenticated, detail: authenticated ? account.stdout : 'No active gcloud account — run `gcloud auth login`.' };
  }
}

export class AzureCliConnector implements CliDetectableConnector {
  readonly id = 'azure' as const;
  readonly displayName = 'Microsoft Azure';

  async detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }> {
    const version = await execCli('az', ['--version']);
    if (!version.ok) return { installed: false, authenticated: false, detail: 'Azure CLI is not installed or not on PATH.' };
    const account = await execCli('az', ['account', 'show']);
    return { installed: true, authenticated: account.ok, detail: account.ok ? account.stdout : 'Not logged in — run `az login`.' };
  }
}

export class DockerCliConnector implements CliDetectableConnector {
  readonly id = 'docker' as const;
  readonly displayName = 'Docker';

  async detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }> {
    const info = await execCli('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (!info.ok) return { installed: false, authenticated: false, detail: 'Docker is not installed, not on PATH, or the Docker daemon is not running.' };
    return { installed: true, authenticated: true, detail: `Docker Engine ${info.stdout}` };
  }
}

export class KubernetesCliConnector implements CliDetectableConnector {
  readonly id = 'kubernetes' as const;
  readonly displayName = 'Kubernetes';

  async detect(): Promise<{ installed: boolean; authenticated: boolean; detail?: string }> {
    const version = await execCli('kubectl', ['version', '--client', '--output=json']);
    if (!version.ok) return { installed: false, authenticated: false, detail: 'kubectl is not installed or not on PATH.' };
    const context = await execCli('kubectl', ['config', 'current-context']);
    return { installed: true, authenticated: context.ok, detail: context.ok ? `Current context: ${context.stdout}` : 'No current kubectl context — run `kubectl config use-context <name>`.' };
  }
}
