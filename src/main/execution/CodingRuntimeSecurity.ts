import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../shared/actions/ActionTypes';
import { CODING_EXECUTION_ACTION_TYPES, INFRA_EXECUTION_ACTION_TYPES } from '../../shared/actions/ActionTypes';
import { createLocalCodingRuntimeSession, type CodingRuntimeSession } from '../../shared/actions/CodingRuntimeSessionTypes';

type PathRole = 'root' | 'cwd' | 'path';

type PathBearingField = {
  field: string;
  value: string;
  role: PathRole;
};

export type CodingRuntimeSecurityResult =
  | {
      ok: true;
      session: CodingRuntimeSession;
      selectedRootPath: string;
      selectedRootRealPath: string;
      checkedFields: PathBearingField[];
    }
  | {
      ok: false;
      result: Extract<ActionResult, { ok: false }>;
    };

const ANALYSIS_ROOT_ACTION_TYPES = new Set<ActionRequest['type']>([
  'analyzeProject',
  'analyzeProjectStructure',
  'analyzeFileImpact',
  'buildDependencyGraph',
  'discoverProjectFeatures',
  'classifyProjectAssets',
  'detectDomainConcepts',
  'buildRepositorySemanticIndex',
  'discoverAffectedFiles',
  'runValidationPipeline',
  'recordArchitecturalDecision',
  'recordCodingPreference',
  'queryCodingRuntimeMemory',
  'getWorkspace',
  'searchFiles',
  'indexWorkspace',
  'findFileSemantic',
  'findDuplicateFiles',
  'analyzeRepository',
  'investigateRepoBug',
]);

const FILE_RUNTIME_ACTION_TYPES = new Set<ActionRequest['type']>([
  'openFolder',
  'openFile',
  'createFolder',
  'writeFile',
  'readFile',
  'listDirectory',
  'movePath',
  'deletePath',
  'copyPath',
  'duplicatePath',
  'compressPath',
  'extractArchive',
  'mergeFolders',
  'splitFile',
  'restorePath',
  'analyzeFolder',
  'mergePdfs',
  'createDocx',
  'createSpreadsheet',
  'analyzeSpreadsheet',
  'createPresentation',
]);

const CENTRAL_BOUNDARY_ACTION_TYPES = new Set<ActionRequest['type']>([
  ...CODING_EXECUTION_ACTION_TYPES,
  ...INFRA_EXECUTION_ACTION_TYPES,
  ...ANALYSIS_ROOT_ACTION_TYPES,
  ...FILE_RUNTIME_ACTION_TYPES,
  'buildProject',
  'readEnvVars',
  'writeEnvVar',
  'runDeployScript',
  'verifyDeployment',
  'gitStatus',
  'gitDiff',
  'gitDiffStat',
  'gitLog',
  'gitBranch',
  'gitShow',
  'gitAdd',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'gitRevertCommit',
  'devBrowserPreview',
  'downloadProjectFile',
  'uploadProjectFile',
  'investigateTicket',
  'investigateProductionIssue',
]);

function failure(message: string): CodingRuntimeSecurityResult {
  return { ok: false, result: { ok: false, reason: 'security-restricted', message } };
}

function requirement(message: string): ActionRequirement {
  return { id: 'coding-runtime-security-boundary', message };
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInsideOrSame(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function nearestExistingPath(candidate: string): string | null {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function realpathNative(value: string): string {
  return fs.realpathSync.native(value);
}

function assertWithinRoot(rootRealPath: string, requestedPath: string, field: string): string | null {
  const absoluteRequestedPath = path.resolve(requestedPath);
  const normalizedRoot = normalizeForCompare(rootRealPath);
  const normalizedRequested = normalizeForCompare(absoluteRequestedPath);

  if (!isInsideOrSame(normalizedRequested, normalizedRoot)) {
    return `${field} must stay inside the selected workspace root.`;
  }

  const existing = nearestExistingPath(absoluteRequestedPath);
  if (!existing) return `${field} could not be resolved against an existing parent.`;

  const existingRealPath = realpathNative(existing);
  const normalizedExistingReal = normalizeForCompare(existingRealPath);
  if (!isInsideOrSame(normalizedExistingReal, normalizedRoot)) {
    return `${field} resolves through a symlink outside the selected workspace root.`;
  }

  if (fs.existsSync(absoluteRequestedPath)) {
    const requestedRealPath = realpathNative(absoluteRequestedPath);
    const normalizedRequestedReal = normalizeForCompare(requestedRealPath);
    if (!isInsideOrSame(normalizedRequestedReal, normalizedRoot)) {
      return `${field} resolves outside the selected workspace root.`;
    }
  }

  return null;
}

function collectPathFields(request: ActionRequest): PathBearingField[] {
  const fields: PathBearingField[] = [];
  const add = (field: string, value: unknown, role: PathRole = 'path') => {
    if (typeof value === 'string' && value.trim()) fields.push({ field, value, role });
  };
  const addArray = (field: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => add(`${field}[${index}]`, entry));
    }
  };

  const maybe = request as Partial<Record<string, unknown>>;
  add('rootPath', maybe.rootPath, 'root');
  add('projectRoot', maybe.projectRoot, 'root');
  add('repoPath', maybe.repoPath, 'root');
  add('cwd', maybe.cwd, 'cwd');
  add('path', maybe.path);
  add('filePath', maybe.filePath);
  add('from', maybe.from);
  add('to', maybe.to);
  add('outputPath', maybe.outputPath);
  add('savePath', maybe.savePath);
  addArray('paths', maybe.paths);
  addArray('inputPaths', maybe.inputPaths);
  addArray('affectedFiles', maybe.affectedFiles);

  if (request.type === 'proposeCodeEditPlan') {
    request.edits.forEach((edit, index) => add(`edits[${index}].path`, edit.path));
  }
  if (request.type === 'recordTaskProvenance') {
    request.actions.forEach((entry, index) => {
      collectPathFields(entry.request).forEach((field) => fields.push({ ...field, field: `actions[${index}].request.${field.field}` }));
    });
  }

  return fields;
}

function selectRoot(request: ActionRequest, fields: PathBearingField[]): string | null {
  const sessionRoot = request.codingRuntimeSession?.executionEnvironment.selectedRootPath ?? request.codingRuntimeSession?.workspace.rootPath;
  if (sessionRoot) return sessionRoot;
  const explicit = fields.find((field) => field.role === 'root')?.value ?? fields.find((field) => field.role === 'cwd')?.value ?? null;
  if (explicit) return explicit;

  // No session and no explicit root/cwd field was supplied. Most single-target file actions
  // (open_folder, read_file, write_file, list_directory, create_folder, ...) have no cwd/rootPath
  // parameter in their tool schema at all — codingRuntimeSession is never populated by
  // ConversationRuntime in production either — so requiring an explicit root here would make
  // these actions permanently unable to pass this gate for a path outside any prior root,
  // no matter how the model retries. For the common, unambiguous case of exactly one path field,
  // derive an implicit root from that path's own nearest existing ancestor directory instead of
  // refusing outright — the single path already fully scopes the action. Requests touching more
  // than one distinct path (movePath, compressPath with several inputs, etc.) still require an
  // explicit root/cwd, since there's no single unambiguous scope to infer between them.
  const pathFields = fields.filter((field) => field.role === 'path');
  const onlyPathField = pathFields[0];
  if (fields.length === 1 && pathFields.length === 1 && onlyPathField) {
    const resolved = path.resolve(onlyPathField.value);
    const parent = nearestExistingPath(path.dirname(resolved));
    if (parent) return parent;
  }
  return null;
}

function commandLooksRootEscaping(command: string): boolean {
  return /(^|[;&|]\s*)cd\s+(\.\.|["']?\.\.[/\\])/i.test(command) || /(^|\s)(\.\.[/\\]|["']\.\.[/\\])/i.test(command);
}

function validationScriptsLookRootEscaping(rootPath: string): boolean {
  const packageJsonPath = path.join(rootPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { scripts?: Record<string, unknown> };
    const scripts = parsed.scripts ?? {};
    return ['typecheck', 'lint', 'build', 'test'].some((name) => typeof scripts[name] === 'string' && commandLooksRootEscaping(scripts[name] as string));
  } catch {
    return false;
  }
}

export function enforceCodingRuntimeSecurity(request: ActionRequest): CodingRuntimeSecurityResult {
  if (!CENTRAL_BOUNDARY_ACTION_TYPES.has(request.type)) {
    return {
      ok: true,
      session:
        request.codingRuntimeSession ??
        createLocalCodingRuntimeSession({ id: `legacy:${Date.now()}`, rootPath: process.cwd(), createdAt: Date.now() }),
      selectedRootPath: process.cwd(),
      selectedRootRealPath: realpathNative(process.cwd()),
      checkedFields: [],
    };
  }

  const fields = collectPathFields(request);
  const selectedRootPath = selectRoot(request, fields);
  if (!selectedRootPath && fields.length === 0) {
    return {
      ok: true,
      session:
        request.codingRuntimeSession ??
        createLocalCodingRuntimeSession({ id: `legacy:${Date.now()}`, rootPath: process.cwd(), createdAt: Date.now() }),
      selectedRootPath: process.cwd(),
      selectedRootRealPath: realpathNative(process.cwd()),
      checkedFields: [],
    };
  }
  if (!selectedRootPath) return failure('Select a workspace root before running file or code actions.');
  if (!fs.existsSync(selectedRootPath)) return failure(`The selected workspace root does not exist: ${selectedRootPath}`);
  if (!fs.statSync(selectedRootPath).isDirectory()) return failure(`The selected workspace root is not a directory: ${selectedRootPath}`);

  const selectedRootRealPath = realpathNative(selectedRootPath);
  for (const field of fields) {
    const value = field.role === 'path' && !path.isAbsolute(field.value) ? path.join(selectedRootPath, field.value) : field.value;
    const message = assertWithinRoot(selectedRootRealPath, value, field.field);
    if (message) return failure(message);
  }

  if ((request.type === 'runCommand' || request.type === 'startProcess') && commandLooksRootEscaping(request.command)) {
    return failure('Commands that change directory or reference parent paths outside the selected workspace are blocked.');
  }

  if (request.type === 'runValidationPipeline' && validationScriptsLookRootEscaping(selectedRootRealPath)) {
    return failure('Validation scripts that reference paths outside the selected workspace are blocked.');
  }

  return {
    ok: true,
    session:
      request.codingRuntimeSession ??
      createLocalCodingRuntimeSession({ id: `legacy:${Date.now()}`, rootPath: selectedRootPath, createdAt: Date.now() }),
    selectedRootPath,
    selectedRootRealPath,
    checkedFields: fields,
  };
}

export function codingRuntimeSecurityRequirements(request: ActionRequest): ActionRequirement[] {
  const result = enforceCodingRuntimeSecurity(request);
  return result.ok ? [] : [requirement(result.result.message ?? 'The selected workspace root must be fixed before this can run.')];
}
