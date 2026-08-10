import { fork, type ChildProcess } from 'child_process';
import * as path from 'path';

// Same 45s-timeout discipline as RunCommandPlugin's TIMEOUT_MS, widened slightly since a full
// project walk + per-file parse is inherently heavier than a single shell command.
const TIMEOUT_MS = 60_000;

export type DependencyGraphBuildResult = {
  edges: Record<string, string[]>;
  exports: Record<string, string[]>;
  fileHashes: Record<string, number>;
  filesAnalyzed: number;
  filesSkipped: number;
  filesReused: number;
};

export type PreviousDependencyGraph = {
  fileHashes: Record<string, number>;
  edges: Record<string, string[]>;
  exports: Record<string, string[]>;
};

type WorkerMessage =
  | ({ type: 'result' } & DependencyGraphBuildResult)
  | { type: 'error'; message: string };

/**
 * Forks DependencyGraphWorker.ts as a standalone child process — never runs the TypeScript
 * compiler inline in the main process, so an expensive parse pass on a large repo can never block
 * the Electron main thread (window responsiveness, IPC, every other plugin). __dirname resolves to
 * the real `dist/main` directory at runtime (webpack's `electron-main` target leaves Node's real
 * `__dirname` in place), so the worker's built output sits alongside main.js at
 * `dist/main/workers/dependencyGraphWorker.js` — see webpack.main.config.js's `entry` map.
 *
 * `previous` (from DependencyGraphCache) lets the worker skip re-parsing files whose mtime hasn't
 * changed since the last build — pass undefined for a first-ever build of a project.
 */
export async function buildDependencyGraph(root: string, previous?: PreviousDependencyGraph): Promise<DependencyGraphBuildResult> {
  const workerPath = path.join(__dirname, 'workers', 'dependencyGraphWorker.js');

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = fork(workerPath, [], { stdio: 'ignore' });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Failed to start the dependency graph worker.'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Dependency graph build timed out after ${TIMEOUT_MS / 1000}s.`));
    }, TIMEOUT_MS);

    child.on('message', (message: WorkerMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (message.type === 'error') {
        reject(new Error(message.message));
        return;
      }
      const { edges, exports: exportsMap, fileHashes, filesAnalyzed, filesSkipped, filesReused } = message;
      resolve({ edges, exports: exportsMap, fileHashes, filesAnalyzed, filesSkipped, filesReused });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 'error' can fire after a successful spawn (e.g. a mid-flight IPC failure), not only when
      // spawning itself failed — kill defensively rather than assuming there's nothing left to
      // clean up. Killing an already-dead process is a safe no-op in Node.
      child.kill();
      reject(err);
    });

    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Dependency graph worker exited unexpectedly (code ${code}).`));
    });

    child.send({ type: 'build', root, previous });
  });
}
