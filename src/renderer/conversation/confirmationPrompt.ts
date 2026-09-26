import type { ActionRequest } from '../../shared/actions/ActionTypes';

/** "allow" (or a plain yes) runs the action PawOS just described in chat. */
const ALLOW_REPLY = /^\s*(allow|yes|yeah|yep|yup|sure|ok(ay)?|go ahead|do it|please do|confirmed?|proceed|sounds good)\b/i;
/** "deny" (or a plain no) skips it. */
const DENY_REPLY = /^\s*(deny|no|nope|don'?t|do not|cancel|skip|stop)\b/i;

export function isAllowReply(text: string): boolean {
  return ALLOW_REPLY.test(text.trim());
}

export function isDenyReply(text: string): boolean {
  return DENY_REPLY.test(text.trim());
}

function field(request: ActionRequest, key: string): string | undefined {
  const value = (request as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** One plain sentence: what PawOS is about to do, with the real command/path. */
export function describePlannedAction(request: ActionRequest): string {
  const path = field(request, 'path');
  const cwd = field(request, 'cwd');
  const command = field(request, 'command');
  const packageId = field(request, 'packageId') ?? field(request, 'name');
  const inFolder = cwd ? ` in ${cwd}` : '';

  switch (request.type) {
    case 'readFile':
      return `read ${path}`;
    case 'listDirectory':
      return `look inside the folder ${path}`;
    case 'searchFiles':
      return `search ${field(request, 'rootPath')} for "${field(request, 'query') ?? ''}"`;
    case 'findFileSemantic':
      return `search ${field(request, 'rootPath')} for "${field(request, 'question') ?? ''}"`;
    case 'analyzeProject':
      return `look through the project in ${field(request, 'rootPath')}`;
    case 'createDocx':
    case 'createSpreadsheet':
    case 'createPresentation':
      return `create ${field(request, 'outputPath')}`;
    case 'copyPath':
      return `copy ${field(request, 'from')} to ${field(request, 'to')}`;
    case 'browseWeb':
      return `open ${field(request, 'url')} in the browser`;
    case 'startProcess':
      return `start \`${command ?? ''}\`${inFolder}`;
    case 'runCommand':
    case 'runDeployScript':
      return `run \`${command ?? ''}\`${inFolder}`;
    case 'writeFile':
      return `write the file ${path}`;
    case 'createFolder':
      return `create the folder ${path}`;
    case 'deletePath':
      return `delete ${path}`;
    case 'movePath':
      return `move ${field(request, 'from')} to ${field(request, 'to')}`;
    case 'mergeFolders':
      return `merge ${field(request, 'from')} into ${field(request, 'to')}`;
    case 'installTool':
      return `install ${packageId}`;
    case 'downloadSoftware':
      return `download and install ${packageId}`;
    case 'updateSoftware':
      return `update ${packageId}`;
    case 'uninstallSoftware':
      return `uninstall ${packageId}`;
    case 'repairSoftware':
      return `repair ${packageId}`;
    case 'setPathEntry':
      return `add ${field(request, 'entry')} to your PATH`;
    case 'setEnvironmentVariable':
      return `set the environment variable ${field(request, 'name')}`;
    case 'writeEnvVar':
      return `set ${field(request, 'key')} in ${path}`;
    case 'gitCommit':
      return `commit your changes${inFolder} with the message "${field(request, 'message') ?? ''}"`;
    case 'gitCreateBranch':
      return `create the git branch ${field(request, 'branchName')}${inFolder}`;
    case 'gitCheckout':
      return `switch git to ${field(request, 'ref')}${inFolder}`;
    case 'gitRevertCommit':
      return `revert commit ${field(request, 'commitSha')}${inFolder}`;
    case 'deployProject':
      return `deploy the project${inFolder} to ${field(request, 'environment') ?? 'production'}`;
    case 'rollbackDeployment':
      return `roll back ${field(request, 'serviceName')}`;
    case 'promoteDeployment':
      return `promote ${field(request, 'serviceName')} to production`;
    case 'resetCompanionMemory':
      return 'reset your companion memory (this deletes saved goals and routines)';
    default: {
      const words = request.type.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
      const target = path ?? command ?? cwd ?? field(request, 'rootPath') ?? field(request, 'outputPath');
      return target ? `${words} (${target})` : words;
    }
  }
}

/** The chat message PawOS posts before every action — no panel, bar or card. */
export function confirmationPrompt(request: ActionRequest): string {
  return `I need permission to ${describePlannedAction(request)}.\nReply "allow" and I'll proceed, or "deny" to skip.`;
}
