import type { ProjectSourceDescriptor } from '../connectivity/ConnectivityTypes';
import type { ProjectContext } from './ProjectTypes';
import type { WorkspaceRecord } from './WorkspaceTypes';

export type ExecutionEnvironmentKind = 'localFilesystem' | 'gitRepository' | 'ssh' | 'docker' | 'ciCd' | 'cloud';

export type ProjectRef = {
  id: string;
  source: ProjectSourceDescriptor;
  context?: ProjectContext;
};

export type WorkspaceRef = {
  id: string;
  rootPath: string;
  record?: WorkspaceRecord;
};

export type ExecutionEnvironmentRef = {
  id: string;
  kind: ExecutionEnvironmentKind;
  selectedRootPath: string;
  adapterStatus: 'available' | 'futureAdapter';
};

export type CodingRuntimeSession = {
  id: string;
  project: ProjectRef;
  workspace: WorkspaceRef;
  executionEnvironment: ExecutionEnvironmentRef;
  createdAt: number;
};

export function createLocalCodingRuntimeSession(params: {
  id: string;
  projectId?: string;
  workspaceId?: string;
  rootPath: string;
  source?: ProjectSourceDescriptor;
  context?: ProjectContext;
  workspaceRecord?: WorkspaceRecord;
  createdAt?: number;
}): CodingRuntimeSession {
  const source: ProjectSourceDescriptor = params.source ?? { kind: 'localFolder', path: params.rootPath };
  const projectId = params.projectId ?? `local:${params.rootPath}`;
  const workspaceId = params.workspaceId ?? `workspace:${params.rootPath}`;

  return {
    id: params.id,
    project: { id: projectId, source, context: params.context },
    workspace: { id: workspaceId, rootPath: params.rootPath, record: params.workspaceRecord },
    executionEnvironment: {
      id: `local-fs:${params.rootPath}`,
      kind: 'localFilesystem',
      selectedRootPath: params.rootPath,
      adapterStatus: 'available',
    },
    createdAt: params.createdAt ?? Date.now(),
  };
}
