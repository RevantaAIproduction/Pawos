import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConnectorResult, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const REMOTE_TIMEOUT_MS = 5 * 60 * 1000;
const SSH_OPTS = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes'];

/** Only safe, unambiguous characters allowed in identifiers that get interpolated into a remote SSH
 * command string — the one place per connector where a value crosses from "argument in an execFile
 * array" to "text inside a single remote command string ssh itself requires." */
export const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

function run(command: string, args: string[], timeoutMs: number): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: (stdout + stderr).trim() });
    });
  });
}

export function validateHostDeployIdentifiers(imageName?: string, containerName?: string): { ok: true } | { ok: false; reason: string } {
  for (const [label, value] of [['image name', imageName], ['container name', containerName]] as const) {
    if (value && !SAFE_IDENTIFIER.test(value)) {
      return { ok: false, reason: `Docker deploy ${label} "${value}" contains characters that aren't safe to use in a remote deploy command — use only letters, numbers, "-", "_", "."` };
    }
  }
  return { ok: true };
}

/**
 * Ensures Docker is installed on a host reachable over `ssh <sshHost>` —
 * essential for freshly-provisioned cloud VMs, which rarely ship with Docker
 * preinstalled. Uses Docker's own official convenience install script
 * (get.docker.com), never a bespoke install — the same "never invent
 * infrastructure" discipline as every other connector here. Safe to call
 * repeatedly: no-ops if Docker is already present.
 */
export async function ensureDockerInstalled(sshHost: string): Promise<ConnectorResult<Record<string, never>>> {
  const check = await run('ssh', [...SSH_OPTS, sshHost, 'docker --version'], 15000);
  if (check.ok) return { ok: true };
  const install = await run('ssh', [...SSH_OPTS, sshHost, 'curl -fsSL https://get.docker.com | sh && systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true'], REMOTE_TIMEOUT_MS);
  if (!install.ok) return { ok: false, reason: `Docker is not installed on ${sshHost}, and the automatic install via Docker's official get.docker.com script failed: ${install.message}` };
  const recheck = await run('ssh', [...SSH_OPTS, sshHost, 'docker --version'], 15000);
  if (!recheck.ok) return { ok: false, reason: `Docker install script ran on ${sshHost} but \`docker --version\` still fails: ${recheck.message}` };
  return { ok: true };
}

/**
 * Shared deploy mechanics for every "SSH + Docker" hosting target, whether
 * the host is a manually-provided VPS (DockerVpsConnector) or a VM PawOS
 * just provisioned on a cloud provider (Vm*Connector). No container registry
 * required: build the image locally, save it to a tarball, copy it to the
 * host via `scp`, `docker load` it remotely, then stop/remove any previous
 * container by the same name and start the new one.
 */
export async function deployDockerToHost(
  projectPath: string,
  sshHost: string,
  imageName: string,
  containerName: string,
  portMapping: string
): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
  const validated = validateHostDeployIdentifiers(imageName, containerName);
  if (!validated.ok) return validated;

  if (!fs.existsSync(path.join(projectPath, 'Dockerfile'))) {
    return { ok: false, reason: `No Dockerfile found at "${projectPath}". Deploying to a host requires the project to already define its own Docker build — PawOS never generates one on your behalf.` };
  }

  const dockerReady = await ensureDockerInstalled(sshHost);
  if (!dockerReady.ok) return dockerReady;

  const tag = `v-${Date.now()}`;
  const fullImage = `${imageName}:${tag}`;

  const build = await run('docker', ['build', '-t', fullImage, projectPath], BUILD_TIMEOUT_MS);
  if (!build.ok) return { ok: false, reason: `docker build failed: ${build.message}` };

  const tmpTar = path.join(os.tmpdir(), `pawos-deploy-${tag}.tar`);
  const save = await run('docker', ['save', '-o', tmpTar, fullImage], BUILD_TIMEOUT_MS);
  if (!save.ok) return { ok: false, reason: `docker save failed: ${save.message}` };

  const remoteTar = `/tmp/pawos-deploy-${tag}.tar`;
  const scp = await run('scp', [...SSH_OPTS, tmpTar, `${sshHost}:${remoteTar}`], REMOTE_TIMEOUT_MS);
  fs.unlink(tmpTar, () => {});
  if (!scp.ok) return { ok: false, reason: `scp to ${sshHost} failed: ${scp.message}` };

  const load = await run('ssh', [...SSH_OPTS, sshHost, `docker load -i ${remoteTar} && rm -f ${remoteTar}`], REMOTE_TIMEOUT_MS);
  if (!load.ok) return { ok: false, reason: `Remote docker load failed: ${load.message}` };

  const restart = await run('ssh', [
    ...SSH_OPTS,
    sshHost,
    `docker stop ${containerName} 2>/dev/null; docker rm ${containerName} 2>/dev/null; docker run -d --name ${containerName} --restart unless-stopped -p ${portMapping} ${fullImage}`,
  ], REMOTE_TIMEOUT_MS);
  if (!restart.ok) return { ok: false, reason: `Remote container start failed: ${restart.message}` };

  const hostOnly = sshHost.split('@').pop() ?? sshHost;
  const publicPort = portMapping.split(':')[0];
  return { ok: true, deploymentUrl: `http://${hostOnly}:${publicPort}`, deploymentId: fullImage };
}

export async function getDockerHostDeployment(sshHost: string, containerName: string, portMapping: string): Promise<ConnectorResult<InfraDeployment>> {
  const result = await run('ssh', [...SSH_OPTS, sshHost, `docker inspect ${containerName} --format '{{.Config.Image}}|{{.State.Status}}|{{.Created}}'`], REMOTE_TIMEOUT_MS);
  if (!result.ok) return { ok: false, reason: `Could not inspect remote container: ${result.message}` };
  const [image, status, createdAt] = result.stdout.split('|');
  if (!image) return { ok: false, reason: `No container named "${containerName}" is currently running on ${sshHost}.` };
  const hostOnly = sshHost.split('@').pop() ?? sshHost;
  const publicPort = portMapping.split(':')[0];
  return { ok: true, deploymentId: image, url: `http://${hostOnly}:${publicPort}`, status: status ?? 'unknown', createdAt: createdAt ?? new Date().toISOString() };
}

/** Rollback re-runs the container from a previously-built, still-locally-cached image tag. */
export async function rollbackDockerHost(sshHost: string, containerName: string, portMapping: string, deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
  const validated = validateHostDeployIdentifiers(undefined, containerName);
  if (!validated.ok) return validated;
  if (!SAFE_IDENTIFIER.test(deploymentId.replace(':', '_'))) return { ok: false, reason: `"${deploymentId}" is not a safe deployment id to roll back to.` };
  const restart = await run('ssh', [
    ...SSH_OPTS,
    sshHost,
    `docker stop ${containerName} 2>/dev/null; docker rm ${containerName} 2>/dev/null; docker run -d --name ${containerName} --restart unless-stopped -p ${portMapping} ${deploymentId}`,
  ], REMOTE_TIMEOUT_MS);
  if (!restart.ok) return { ok: false, reason: `Rollback failed: ${restart.message}` };
  return { ok: true };
}
