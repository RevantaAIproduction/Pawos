import { execCli } from '../infrastructure/connectors/cli/execCli';
import { AwsCliConnector, GcpCliConnector, AzureCliConnector, DockerCliConnector, KubernetesCliConnector } from '../infrastructure/connectors/cli/CliDetectConnectors';
import { connectorRegistry } from './ConnectorRegistry';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectorCategory, DiscoveredCapability } from '../../shared/connectivity/ConnectivityTypes';

/** Same "where"/"which" convention used to locate an executable's real path,
 *  read-only, `execFile`-with-args-array discipline (never a shell string). */
const WHICH_COMMAND = process.platform === 'win32' ? 'where' : 'which';

async function findPath(command: string): Promise<string | undefined> {
  const result = await execCli(WHICH_COMMAND, [command]);
  if (!result.ok) return undefined;
  return result.stdout.split(/\r?\n/)[0]?.trim() || undefined;
}

/** For most tools `<cmd> --version` prints to stdout; Java is the one
 *  well-known exception (its version always goes to stderr even on a
 *  successful exit), so this checks both rather than assuming stdout. */
async function probeVersion(command: string, args: string[]): Promise<string | undefined> {
  const result = await execCli(command, args);
  if (result.ok) return result.stdout.split(/\r?\n/)[0]?.trim() || undefined;
  // execCli treats a clean exit as `ok: true` regardless of which stream had
  // content; getting here means the process itself failed to run at all.
  return undefined;
}

type Probe = { id: string; displayName: string; category: ConnectorCategory; capability: string; probe: () => Promise<{ available: boolean; version?: string }> };

/** Tools with no existing detector in this codebase — new, thin, read-only
 *  probes following execCli's established discipline. */
const SIMPLE_PROBES: Probe[] = [
  { id: 'git', displayName: 'Git', category: 'localApplication', capability: 'runGitCommands', probe: () => versionOnly('git', ['--version']) },
  { id: 'node', displayName: 'Node.js', category: 'localApplication', capability: 'runNodeCommands', probe: () => versionOnly('node', ['--version']) },
  { id: 'python', displayName: 'Python', category: 'localApplication', capability: 'runPythonCommands', probe: () => versionOnlyEitherStream('python', ['--version']) },
  { id: 'java', displayName: 'Java', category: 'localApplication', capability: 'runJavaCommands', probe: () => versionOnlyEitherStream('java', ['-version']) },
  { id: 'vscode', displayName: 'VS Code', category: 'localApplication', capability: 'openInEditor', probe: () => versionOnly('code', ['--version']) },
  { id: 'cursor', displayName: 'Cursor', category: 'localApplication', capability: 'openInEditor', probe: () => versionOnly('cursor', ['--version']) },
  { id: 'windsurf', displayName: 'Windsurf', category: 'localApplication', capability: 'openInEditor', probe: () => versionOnly('windsurf', ['--version']) },
  { id: 'ollama', displayName: 'Ollama', category: 'localApplication', capability: 'runLocalLlm', probe: () => versionOnly('ollama', ['--version']) },
];

async function versionOnly(command: string, args: string[]): Promise<{ available: boolean; version?: string }> {
  const version = await probeVersion(command, args);
  return { available: version !== undefined, version };
}

/** Some Python/Java builds print the version to stderr even on success —
 *  execCli only surfaces stdout on the ok path, so this falls back to a
 *  direct stderr-inclusive check when the plain probe comes back empty. */
async function versionOnlyEitherStream(command: string, args: string[]): Promise<{ available: boolean; version?: string }> {
  const viaStdout = await versionOnly(command, args);
  if (viaStdout.available) return viaStdout;
  const raw = await execCli(command, args);
  // execCli resolves `{ok:false, stderr}` on a genuine failure to launch,
  // but some runtimes exit 0 while writing only to stderr — execCli's own
  // contract doesn't expose stderr on the ok path, so a non-empty stderr on
  // the "failed" branch here still indicates the tool is actually present.
  if (!raw.ok && raw.stderr) return { available: true, version: raw.stderr.split(/\r?\n/)[0]?.trim() };
  return { available: false };
}

/** Tools this codebase already has real detectors for (see
 *  CliDetectConnectors.ts) — reused as-is for the availability signal, not
 *  reimplemented. Version/path are new, supplementary, thin probes this
 *  service adds on top; they were never captured by the existing detectors. */
const REUSED_PROBES: { id: string; displayName: string; category: ConnectorCategory; capability: string; detect: () => Promise<{ installed: boolean }>; versionArgs: [string, string[]] }[] = [
  { id: 'docker', displayName: 'Docker', category: 'container', capability: 'runContainerCommands', detect: () => new DockerCliConnector().detect(), versionArgs: ['docker', ['--version']] },
  { id: 'kubectl', displayName: 'Kubernetes', category: 'container', capability: 'runKubernetesCommands', detect: () => new KubernetesCliConnector().detect(), versionArgs: ['kubectl', ['version', '--client']] },
  { id: 'aws-cli', displayName: 'AWS CLI', category: 'cloud', capability: 'runAwsCliCommands', detect: () => new AwsCliConnector().detect(), versionArgs: ['aws', ['--version']] },
  { id: 'azure-cli', displayName: 'Azure CLI', category: 'cloud', capability: 'runAzureCliCommands', detect: () => new AzureCliConnector().detect(), versionArgs: ['az', ['--version']] },
  { id: 'gcloud', displayName: 'gcloud CLI', category: 'cloud', capability: 'runGcloudCommands', detect: () => new GcpCliConnector().detect(), versionArgs: ['gcloud', ['--version']] },
];

function buildLocalToolSdk(capability: DiscoveredCapability, category: ConnectorCategory, capabilityName: string, probe: () => Promise<{ available: boolean; version?: string }>): ConnectorSDK {
  return {
    definition: {
      id: capability.id,
      displayName: capability.displayName,
      category,
      authMethod: 'none',
      capabilities: [capabilityName],
    },
    // Nothing to authenticate for a local presence check — these are no-ops,
    // not stubs standing in for unimplemented behavior.
    connect: async () => ({
      id: `local-${capability.id}`,
      connectorId: capability.id,
      scope: { userId: 'local' },
      status: 'connected' as const,
      grantedPermissions: [],
      metadata: { version: capability.version, path: capability.path },
    }),
    disconnect: async () => {},
    authenticate: async () => {},
    refresh: async () => {},
    validate: async () => ({ valid: capability.available }),
    health: async () => {
      const result = await probe();
      return { status: result.available ? 'healthy' : 'down' };
    },
    capabilities: () => [capabilityName],
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: async () => {
      throw new Error(`'${capability.id}' is a local presence-detection connector and does not support execute().`);
    },
  };
}

/**
 * Auto-detects locally-available development tools and populates the
 * Connector Registry with them — Git, Node.js, Python, Java, Docker,
 * Kubernetes, AWS/Azure/gcloud CLI, VS Code, Cursor, Windsurf, Ollama.
 * Unlike a real (Jira/GitHub/Slack-style) connector, these need no OAuth,
 * no API calls, no external authentication — `authMethod: 'none'` — a
 * presence check is the entire contract, which is why registering them
 * during this framework-only phase doesn't count as "implementing a
 * connector" in the sense the rest of Phase 1 is scoped against.
 */
class DiscoveryService {
  private registeredIds = new Set<string>();

  async discover(): Promise<DiscoveredCapability[]> {
    const results: DiscoveredCapability[] = [];

    for (const entry of SIMPLE_PROBES) {
      const { available, version } = await entry.probe();
      const path = available ? await findPath(entry.id === 'vscode' ? 'code' : entry.id) : undefined;
      results.push({ id: entry.id, displayName: entry.displayName, available, version, path });
    }

    for (const entry of REUSED_PROBES) {
      const { installed } = await entry.detect();
      const [command] = entry.versionArgs;
      const version = installed ? await probeVersion(...entry.versionArgs) : undefined;
      const path = installed ? await findPath(command) : undefined;
      results.push({ id: entry.id, displayName: entry.displayName, available: installed, version, path });
    }

    return results;
  }

  /** Re-runnable at any time (startup, and on-demand from the Connections
   *  UI's "Refresh" action) without accumulating duplicates or leaving a
   *  tool registered after it's no longer detected — every previously
   *  discovery-registered id is unregistered first, then only what's
   *  actually present now is re-added. */
  async discoverAndRegister(): Promise<void> {
    for (const id of this.registeredIds) connectorRegistry.unregister(id);
    this.registeredIds.clear();

    const capabilities = await this.discover();
    const allEntries = [...SIMPLE_PROBES, ...REUSED_PROBES.map((r) => ({ id: r.id, category: r.category, capability: r.capability }))];

    for (const capability of capabilities) {
      if (!capability.available) continue;
      const entry = allEntries.find((e) => e.id === capability.id);
      if (!entry) continue;
      connectorRegistry.register(buildLocalToolSdk(capability, entry.category, entry.capability, () => this.probeById(capability.id)));
      this.registeredIds.add(capability.id);
    }
  }

  private async probeById(id: string): Promise<{ available: boolean; version?: string }> {
    const simple = SIMPLE_PROBES.find((e) => e.id === id);
    if (simple) return simple.probe();
    const reused = REUSED_PROBES.find((e) => e.id === id);
    if (reused) {
      const { installed } = await reused.detect();
      return { available: installed };
    }
    return { available: false };
  }
}

export const discoveryService = new DiscoveryService();
