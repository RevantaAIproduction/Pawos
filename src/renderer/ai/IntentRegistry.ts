import type { ReasoningToolDefinition, ReasoningToolCall } from '../reasoning/ReasoningTypes';
import type { ActionRequest, KnownAppId } from '../../shared/actions/ActionTypes';
import { companionProfileStore } from '../companion/manager/CompanionProfileStore';

/** Shared wording for every `confirmed` parameter — repeated per-tool (not just in the system prompt) so the model sees it right where it matters, at the moment it's filling the field in. */
const CONFIRMED_PARAM_DESCRIPTION =
  'Only set this to true if the user has explicitly said yes to a specific question you already asked them in your previous message. Never set this true on a first attempt at this action.';

/**
 * The "AI decides WHAT, PawOS decides HOW" boundary: Gemini (or any future
 * provider) only ever returns one of these named intents with arguments.
 * Turning that into an actual OS action is entirely PawOS's job — via the
 * Desktop Execution Engine (in the main process), which independently
 * enforces its own confirmation gate for destructive actions regardless of
 * what the AI claims. Only intents the engine actually implements are
 * listed here — nothing is offered to the AI that would just fail silently.
 */
export const ACTION_TOOL_DEFINITIONS: ReasoningToolDefinition[] = [
  {
    name: 'open_url',
    description: 'Open a URL in the default web browser.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full http(s) URL to open.' } },
      required: ['url'],
    },
  },
  {
    name: 'open_app',
    description: 'Open a known desktop application, optionally at/with a specific file or folder.',
    parameters: {
      type: 'object',
      properties: {
        appId: {
          type: 'string',
          enum: ['vscode', 'cursor', 'visualstudio', 'intellij', 'androidstudio', 'chrome', 'edge', 'explorer', 'notepad', 'terminal'],
          description: 'Which known application to launch — pick whichever fits the task, the user should never have to name one themselves.',
        },
        path: {
          type: 'string',
          description:
            'Optional. A folder or file to open the app at — e.g. a project folder for VS Code, a starting directory for the terminal, or a file for Notepad.',
        },
      },
      required: ['appId'],
    },
  },
  {
    name: 'open_folder',
    description: "Open a folder in the system's file explorer.",
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute folder path.' } },
      required: ['path'],
    },
  },
  {
    name: 'open_file',
    description: 'Open a specific file with its default application.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the file to open.' } },
      required: ['path'],
    },
  },
  {
    name: 'read_clipboard',
    description: "Read the current text content of the user's system clipboard.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_folder',
    description: 'Create a new folder at the given path. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the folder to create.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description:
      "Search for files under a root directory — by name, content, extension, modified date, size, or fuzzy name match. Use this to find files even when you don't know the exact filename (e.g. someone's resume might be named CV.docx, Curriculum Vitae.docx, or Profile.pdf).",
    parameters: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: 'Absolute directory to search under.' },
        query: { type: 'string', description: 'Substring (or fuzzy pattern, if fuzzy is true) to match against file/folder names. Pass an empty string to match all names and filter by other criteria instead.' },
        contentQuery: { type: 'string', description: 'Optional substring to search for inside file contents (bounded — large/binary files are skipped).' },
        extensions: { type: 'array', items: { type: 'string' }, description: "Optional extension allowlist, e.g. ['.pdf', '.docx']." },
        modifiedAfter: { type: 'number', description: 'Optional: only files modified after this Unix timestamp (ms).' },
        modifiedBefore: { type: 'number', description: 'Optional: only files modified before this Unix timestamp (ms).' },
        minSizeBytes: { type: 'number', description: 'Optional minimum file size in bytes.' },
        maxSizeBytes: { type: 'number', description: 'Optional maximum file size in bytes.' },
        fuzzy: { type: 'boolean', description: 'If true, ranks filenames by fuzzy similarity to query instead of requiring an exact substring.' },
        maxResults: { type: 'number', description: 'Optional cap on how many results to return.' },
      },
      required: ['rootPath', 'query'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write text content to a file, creating it (and any parent folders) if needed. If the file already exists, PawOS will ask the user to confirm before overwriting it.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the file to write.' },
        content: { type: 'string', description: 'The full text content to write to the file.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a real command-line command in a project directory. Only npm, npx, node, git, python, pip, yarn, pnpm, and AI CLI workers (claude, codex, gemini, ollama) are allowed — anything else is refused. AI CLIs are just another interchangeable worker: reach for one when it fits the task (e.g. delegating a coding task to claude/codex, or running a local model via ollama) without the user having to ask for it by name. Destructive — PawOS will always ask the user to confirm before running it, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The full command to run, e.g. "npm install react".' },
        cwd: { type: 'string', description: 'Absolute path of the project directory to run the command in.' },
        shell: { type: 'string', enum: ['cmd', 'powershell', 'gitbash'], description: 'Which shell interprets the command. Omit unless the command genuinely needs that shell\'s own syntax (defaults to cmd).' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['command', 'cwd'],
    },
  },
  {
    name: 'start_process',
    description:
      'Start a long-running background process (a dev server, a watch build, a local AI CLI worker) that keeps running rather than finishing. Use this instead of run_command for anything not expected to exit on its own, e.g. "npm run dev" or "ollama serve". Same allowed prefixes as run_command. Not destructive — no confirmation needed.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The full command to run, e.g. "npm run dev".' },
        cwd: { type: 'string', description: 'Absolute path of the project directory to run the command in.' },
        label: { type: 'string', description: 'Optional short human-readable label for this process, e.g. "dev server".' },
        shell: { type: 'string', enum: ['cmd', 'powershell', 'gitbash'], description: 'Which shell interprets the command. Omit unless the command genuinely needs that shell\'s own syntax (defaults to cmd).' },
      },
      required: ['command', 'cwd'],
    },
  },
  {
    name: 'stop_process',
    description: 'Stop a background process previously started with start_process, using its processId.',
    parameters: {
      type: 'object',
      properties: { processId: { type: 'string', description: 'The id returned when the process was started.' } },
      required: ['processId'],
    },
  },
  {
    name: 'restart_process',
    description: 'Stop and restart a background process previously started with start_process, using its processId. Returns a new processId.',
    parameters: {
      type: 'object',
      properties: { processId: { type: 'string', description: 'The id of the process to restart.' } },
      required: ['processId'],
    },
  },
  {
    name: 'list_processes',
    description: 'List every background process PawOS is currently tracking, with status and pid.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_process_output',
    description: "Read a background process's recent output (stdout/stderr) — use this to check on a dev server or build before deciding it's ready or has failed.",
    parameters: {
      type: 'object',
      properties: {
        processId: { type: 'string', description: 'The id of the process to read output from.' },
        maxChars: { type: 'number', description: 'Optional cap on how many characters of recent output to return.' },
      },
      required: ['processId'],
    },
  },
  {
    name: 'analyze_project',
    description:
      "Inspect a project folder on disk and report its framework, language, package manager, build tool, runtime, available scripts, git repo, docker usage, likely ports, whether it has tests, and which env files exist. Call this before debugging or making changes in a project you haven't already inspected — never guess a project's structure when you can check it.",
    parameters: {
      type: 'object',
      properties: { rootPath: { type: 'string', description: 'Absolute path of the project root to inspect.' } },
      required: ['rootPath'],
    },
  },
  {
    name: 'analyze_project_structure',
    description:
      "Build \"Project Understanding\" for the Coding Canvas — a shallow file tree, the project's real package.json dependencies/devDependencies, and its entry point, stored as a codingProject memory so later questions about this project's structure don't require re-scanning. Read-only, available in both Paw Go and Paw Pro. Call this once per project near the start of coding work, alongside or instead of analyze_project.",
    parameters: {
      type: 'object',
      properties: { rootPath: { type: 'string', description: 'Absolute path of the project root to map.' } },
      required: ['rootPath'],
    },
  },
  {
    name: 'analyze_file_impact',
    description:
      "\"File impact analysis\" — best-effort search for which other project files reference a given file's basename. This is a text-substring heuristic, NOT a real import/dependency graph — say so honestly if you report it. Read-only, available in both Paw Go and Paw Pro. Use before changing or deleting a file's public surface, to gauge blast radius.",
    parameters: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: 'Absolute path of the project root to search within.' },
        filePath: { type: 'string', description: 'Absolute path of the file whose impact to check.' },
      },
      required: ['rootPath', 'filePath'],
    },
  },
  {
    name: 'list_workspaces',
    description: 'List every project Paw has previously opened/analyzed, so the user can say "continue my CRM" without re-searching the disk.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_workspace',
    description: "Get what Paw remembers about a specific previously-opened project (framework, ports, last successful build, recent commands, etc.).",
    parameters: {
      type: 'object',
      properties: { rootPath: { type: 'string', description: 'Absolute root path of the project.' } },
      required: ['rootPath'],
    },
  },
  {
    name: 'check_process_health',
    description:
      "Verify a background process is actually ready — never assume a dev server is live just because it started or a command exited 0. Give a logPattern (e.g. \"Local:\\\\s+https?://\" for a dev server's ready line) and/or a url to check; omit both to just confirm it's still alive. Call this before telling the user something is running.",
    parameters: {
      type: 'object',
      properties: {
        processId: { type: 'string', description: 'The id of the process to check.' },
        url: { type: 'string', description: 'Optional URL to poll (e.g. http://localhost:3000) until it responds.' },
        logPattern: { type: 'string', description: "Optional regex to wait for in the process's recent output before checking the URL." },
        timeoutMs: { type: 'number', description: 'Optional max time to wait, in milliseconds.' },
      },
      required: ['processId'],
    },
  },
  {
    name: 'read_file',
    description:
      "Read a file's content into context — text, code, or a document (PDF/Word/Excel/CSV/JSON/XML), or an image's metadata. Format is auto-detected from the extension unless overridden. Not destructive.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the file to read.' },
        maxChars: { type: 'number', description: 'Optional cap on how many characters to return.' },
        format: {
          type: 'string',
          enum: ['auto', 'text', 'pdf', 'docx', 'xlsx', 'csv', 'json', 'xml', 'image-metadata'],
          description: "Optional explicit format override — defaults to 'auto' (detected from the file extension).",
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List the files and folders directly inside a directory (name, whether each is a folder, and size). Not destructive.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the directory to list.' } },
      required: ['path'],
    },
  },
  {
    name: 'move_path',
    description:
      'Move or rename a file or folder. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Absolute current path of the file or folder.' },
        to: { type: 'string', description: 'Absolute destination path.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'delete_path',
    description:
      "Delete a file or folder (recursively, if a folder). Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested. By default this is recoverable (goes to Paw's own trash, restorable with restore_path) — only set permanent:true when the user explicitly wants it gone for good.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the file or folder to delete.' },
        permanent: { type: 'boolean', description: 'If true, deletes immediately and unrecoverably instead of going to trash. Defaults to false.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['path'],
    },
  },
  {
    name: 'copy_path',
    description: 'Copy a file or folder to a new location, leaving the original in place.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Absolute path of the file or folder to copy.' },
        to: { type: 'string', description: 'Absolute destination path.' },
        confirmed: { type: 'boolean', description: 'Set true only if the user already confirmed overwriting an existing file/folder at the destination.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'duplicate_path',
    description: 'Duplicate a file or folder next to itself as "name (copy).ext" — always picks a free name, never needs confirmation.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the file or folder to duplicate.' } },
      required: ['path'],
    },
  },
  {
    name: 'compress_path',
    description: 'Compress one or more files/folders into a single .zip archive.',
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of the files/folders to compress.' },
        to: { type: 'string', description: 'Absolute path of the .zip file to create.' },
        confirmed: { type: 'boolean', description: 'Set true only if the user already confirmed overwriting an existing archive at the destination.' },
      },
      required: ['paths', 'to'],
    },
  },
  {
    name: 'extract_archive',
    description: 'Extract a .zip archive into a folder. To remove the archive afterward, call delete_path separately.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the .zip archive.' },
        to: { type: 'string', description: 'Absolute destination folder to extract into.' },
        confirmed: { type: 'boolean', description: 'Set true only if the user already confirmed overwriting an existing destination folder.' },
      },
      required: ['path', 'to'],
    },
  },
  {
    name: 'merge_folders',
    description:
      'Merge every entry of one folder into another, applying a conflict policy to files that already exist at the destination. Destructive — PawOS will always ask the user to confirm.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Absolute path of the source folder.' },
        to: { type: 'string', description: 'Absolute path of the destination folder.' },
        onConflict: { type: 'string', enum: ['skip', 'overwrite', 'rename'], description: 'What to do when a file already exists at the destination.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['from', 'to', 'onConflict'],
    },
  },
  {
    name: 'split_file',
    description: 'Split a large file into fixed-size numbered chunks (name.001, name.002, ...).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the file to split.' },
        to: { type: 'string', description: 'Absolute path prefix for the chunk files.' },
        chunkSizeBytes: { type: 'number', description: 'Maximum size of each chunk, in bytes.' },
        confirmed: { type: 'boolean', description: 'Set true only if the user already confirmed overwriting existing chunk files.' },
      },
      required: ['path', 'to', 'chunkSizeBytes'],
    },
  },
  {
    name: 'restore_path',
    description: "Restore a file or folder previously deleted with delete_path (only works for non-permanent deletes — Paw's own trash).",
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'The original absolute path of the file or folder to restore.' } },
      required: ['path'],
    },
  },
  {
    name: 'index_workspace',
    description:
      "Build or refresh Paw's long-term memory of a folder — reads and classifies its documents (resume, proposal, invoice, contract, meeting notes, ...) so later questions like \"find my resume\" or \"open the proposal for X\" resolve by meaning, not filename. Use this once per folder before relying on find_file_semantic there, or when the user explicitly asks to re-index something. Not destructive — never modifies user files, only Paw's own memory.",
    parameters: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: 'Absolute path of the folder to index.' },
        workspaceName: { type: 'string', description: 'Optional human name for this workspace (e.g. "CareerForge"). Defaults to the folder name.' },
      },
      required: ['rootPath'],
    },
  },
  {
    name: 'find_file_semantic',
    description:
      'Find a file by meaning rather than filename, within an already-indexed root — e.g. "find my resume" matches CV.docx or Curriculum Vitae.docx, "the proposal for ABC Industries" matches a file that mentions that client even if its filename says Quotation.pdf. Call index_workspace on the root first if you have not already.',
    parameters: {
      type: 'object',
      properties: {
        rootPath: { type: 'string', description: 'Absolute path of the already-indexed root to search within.' },
        question: { type: 'string', description: 'What the user is looking for, in their own words.' },
        docType: { type: 'string', description: "Optional hint like 'resume', 'proposal', 'invoice', 'contract', 'meeting-notes', 'presentation', 'design', 'research', 'requirements'." },
        client: { type: 'string', description: 'Optional client/company name mentioned in the request.' },
      },
      required: ['rootPath', 'question'],
    },
  },
  {
    name: 'get_workspace_bundle',
    description:
      'Get everything Paw knows about a workspace — its root folder(s) and its most relevant recent files — so you can decide what to open. Use this for requests like "open my CareerForge workspace": call this first, then issue the actual open_app/open_folder/open_file/browse_web calls yourself based on what it returns.',
    parameters: {
      type: 'object',
      properties: { workspaceRef: { type: 'string', description: 'The workspace name or root path.' } },
      required: ['workspaceRef'],
    },
  },
  {
    name: 'query_provenance',
    description:
      'Ask Paw\'s memory a provenance question about a file or workspace — when it was last worked on, what it was created from, everything related to it, or what workspace it belongs to. Answers "when did I last work on this proposal," "what meeting created this document," "show me everything related to CareerForge."',
    parameters: {
      type: 'object',
      properties: {
        entityRef: { type: 'string', description: 'A file path or workspace name/root already known to Paw.' },
        question: { type: 'string', enum: ['lastWorkedOn', 'createdFrom', 'relatedTo', 'belongsTo'] },
      },
      required: ['entityRef', 'question'],
    },
  },
  {
    name: 'explain_classification',
    description: 'Explain why Paw classified a file the way it did (e.g. "why did you call this a proposal?") — returns the real evidence, never a re-justification.',
    parameters: {
      type: 'object',
      properties: { entityRef: { type: 'string', description: 'The file path.' } },
      required: ['entityRef'],
    },
  },
  {
    name: 'explain_relationship',
    description: 'Explain why Paw thinks two things are connected (e.g. "why do you think this belongs to CareerForge?") — returns the real evidence, never a re-justification.',
    parameters: {
      type: 'object',
      properties: {
        fromRef: { type: 'string', description: 'A file path or workspace name.' },
        toRef: { type: 'string', description: 'A file path or workspace name.' },
      },
      required: ['fromRef', 'toRef'],
    },
  },
  {
    name: 'find_duplicate_files',
    description: 'Find files with byte-identical content under a root folder, confirmed by a full content hash (not just name/size). Read-only — returns groups, never deletes anything itself.',
    parameters: {
      type: 'object',
      properties: { rootPath: { type: 'string', description: 'Absolute path to search under.' } },
      required: ['rootPath'],
    },
  },
  {
    name: 'analyze_folder',
    description:
      'Analyze a folder and return ranked suggestions (never performs any action itself) — e.g. for "clean my Downloads folder," call this with purpose "downloads-cleanup", show the user the suggestions, and only after they confirm issue the actual move_path/delete_path/compress_path calls.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the folder to analyze.' },
        purpose: { type: 'string', enum: ['downloads-cleanup', 'archive-suggestion', 'temp-files', 'sort-by-project', 'sort-by-date', 'sort-by-type'] },
      },
      required: ['path', 'purpose'],
    },
  },
  {
    name: 'get_special_folders',
    description: "Get the user's Documents/Downloads/Desktop/Pictures/Videos/Music folder locations (correctly resolves OneDrive-redirected folders).",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_status',
    description: 'Check a git repository\'s working-tree status — current branch, ahead/behind counts, staged/unstaged/untracked files. Read-only.',
    parameters: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'Absolute path of the repository.' } },
      required: ['cwd'],
    },
  },
  {
    name: 'git_diff',
    description: 'Show the current diff in a git repository. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        staged: { type: 'boolean', description: 'True to show staged changes (git diff --staged) instead of unstaged.' },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'git_diff_stat',
    description:
      "\"Live Code Diff\" for the Coding Canvas — real per-file +/- line counts (git diff --numstat), distinct from git_diff's raw diff text. Read-only. Only works for git-tracked projects; honestly fails otherwise, never fabricates line counts.",
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        staged: { type: 'boolean', description: 'True to show staged changes instead of unstaged.' },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'git_log',
    description: 'Show recent commits in a git repository. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        maxCount: { type: 'number', description: 'How many recent commits to show (default 20).' },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'git_branch',
    description: 'Show the current branch and list of local branches in a git repository. Read-only — does not create, delete, or switch branches.',
    parameters: {
      type: 'object',
      properties: { cwd: { type: 'string', description: 'Absolute path of the repository.' } },
      required: ['cwd'],
    },
  },
  {
    name: 'git_show',
    description: 'Show a specific commit, tag, or ref in a git repository — e.g. what a commit actually changed. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        ref: { type: 'string', description: 'Commit hash, tag, or ref to show (e.g. "HEAD", "abc1234").' },
      },
      required: ['cwd', 'ref'],
    },
  },
  {
    name: 'git_add',
    description: 'Stage changes in a git repository (git add). Not destructive — staging is trivially reversible — but is usually the step right before git_commit, which does need confirmation.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Specific paths to stage. Omit to stage everything changed (git add .).' },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'git_commit',
    description: 'Commit staged changes in a git repository. Creates a real, permanent history entry — always ask the user to confirm first, e.g. as a checkpoint before a risky refactor.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        message: { type: 'string', description: 'The commit message.' },
        confirmed: { type: 'boolean', description: 'Set true only after the user has explicitly agreed to this commit.' },
      },
      required: ['cwd', 'message'],
    },
  },
  {
    name: 'git_create_branch',
    description: 'Create a new git branch without switching to it. Use before a risky change (refactor, dependency upgrade) so there is a real point to return to. Call git_checkout separately to actually switch onto it.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        branchName: { type: 'string', description: 'Name for the new branch.' },
        confirmed: { type: 'boolean', description: 'Set true only after the user has explicitly agreed.' },
      },
      required: ['cwd', 'branchName'],
    },
  },
  {
    name: 'git_checkout',
    description: 'Switch the working tree to a different branch, tag, or commit (git checkout). Can fail if it would overwrite uncommitted local changes — that failure is expected and safe, never forced.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the repository.' },
        ref: { type: 'string', description: 'Branch name, tag, or commit to switch to.' },
        confirmed: { type: 'boolean', description: 'Set true only after the user has explicitly agreed.' },
      },
      required: ['cwd', 'ref'],
    },
  },
  {
    name: 'install_tool',
    description:
      'Install ANY desktop software — a real winget package (Python, Node.js, Java, Git, Docker, FFmpeg, Ollama, VS Code, Blender, PostgreSQL, or literally anything else winget knows about), a global npm package, a pip package, or a VS Code extension. Works generically for any package — never hardcode special handling per app. If the exact winget id fails, it automatically retries treating packageId as a plain search name. It also automatically verifies the install really worked (via executableHint/verifyCommand/launchCommand, or falls back to checking the package manager\'s own installed-list) and attempts one automatic repair pass if verification fails, before honestly reporting failure. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested. Prefer giving executableHint (a bare command name like "git" or "java") or verifyCommand whenever you can guess it, so the install is actually checked rather than just trusted.',
    parameters: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['winget', 'npm', 'pip', 'code-extension'], description: 'Which installer to use.' },
        packageId: { type: 'string', description: 'The package/tool id or name — e.g. "Oracle.JDK.21" or just "OpenJDK" for winget, "typescript" for npm, "requests" for pip, "ms-python.python" for a VS Code extension.' },
        verifyCommand: { type: 'string', description: 'Optional "<program> --version"-style command to confirm the install actually worked.' },
        executableHint: { type: 'string', description: 'Optional bare executable name (e.g. "git", "java", "python") to confirm is on PATH after install — an alternative to verifyCommand.' },
        launchCommand: { type: 'string', description: 'Optional command to launch a GUI app after installing it (e.g. an absolute .exe path), paired with expectedProcessName, to confirm it actually opens.' },
        expectedProcessName: { type: 'string', description: 'Expected OS process image name (e.g. "Code.exe") that launchCommand should produce.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['manager', 'packageId'],
    },
  },
  {
    name: 'detect_software',
    description: 'Check whether a package is already installed, and its version if so — always do this before installing something, rather than guessing. Not destructive.',
    parameters: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['winget', 'npm', 'pip', 'code-extension'], description: 'Which package manager to check with.' },
        packageId: { type: 'string', description: 'The package/tool id or name to check.' },
      },
      required: ['manager', 'packageId'],
    },
  },
  {
    name: 'update_software',
    description: 'Update an already-installed package to its latest version. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['winget', 'npm', 'pip', 'code-extension'], description: 'Which package manager to use.' },
        packageId: { type: 'string', description: 'The package/tool id to update.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['manager', 'packageId'],
    },
  },
  {
    name: 'uninstall_software',
    description: 'Uninstall a package. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['winget', 'npm', 'pip', 'code-extension'], description: 'Which package manager to use.' },
        packageId: { type: 'string', description: 'The package/tool id to uninstall.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['manager', 'packageId'],
    },
  },
  {
    name: 'repair_software',
    description: "Force-reinstall a package that's broken or partially installed, then re-verify it. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.",
    parameters: {
      type: 'object',
      properties: {
        manager: { type: 'string', enum: ['winget', 'npm', 'pip', 'code-extension'], description: 'Which package manager to use.' },
        packageId: { type: 'string', description: 'The package/tool id to repair.' },
        verifyCommand: { type: 'string', description: 'Optional version-check command to confirm the repair worked.' },
        executableHint: { type: 'string', description: 'Optional bare executable name to confirm is on PATH after repair.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['manager', 'packageId'],
    },
  },
  {
    name: 'verify_tool_installed',
    description: 'Check whether a command-line tool is installed and on PATH — e.g. "git --version" or "docker --version". Not destructive.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'A "<program> <version-flag>" command, e.g. "node --version".' } },
      required: ['command'],
    },
  },
  {
    name: 'set_path_entry',
    description:
      'Add a folder to real Windows PATH — system-wide (Machine scope) by default, so the computer is genuinely, fully configured, not just for whichever account happens to be logged in. System-wide requires administrator permission: if it isn\'t available, this reports that clearly instead of silently only configuring your account — relay that explanation to the user and ask whether to retry with administrator permission or settle for just their account, then call this again with `preferredScope` set to whichever they choose. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Absolute folder path to add to PATH.' },
        preferredScope: { type: 'string', enum: ['machine', 'user'], description: 'Only set this after a prior call reported administrator permission wasn\'t available and the user chose which scope to use. Omit on the first attempt.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['entry'],
    },
  },
  {
    name: 'set_environment_variable',
    description:
      'Set a named environment variable (e.g. JAVA_HOME, ANDROID_HOME) — system-wide (Machine scope) by default, so the computer is genuinely, fully configured. Use this to finish configuring a tool after installing it. System-wide requires administrator permission: if it isn\'t available, this reports that clearly instead of silently only configuring your account — relay that explanation to the user and ask whether to retry with administrator permission or settle for just their account, then call this again with `preferredScope` set to whichever they choose. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The environment variable name, e.g. "JAVA_HOME".' },
        value: { type: 'string', description: 'The value to set it to, e.g. an absolute install path.' },
        preferredScope: { type: 'string', enum: ['machine', 'user'], description: 'Only set this after a prior call reported administrator permission wasn\'t available and the user chose which scope to use. Omit on the first attempt.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['name', 'value'],
    },
  },
  {
    name: 'open_dev_browser',
    description:
      'Open a URL in a real Development Browser window — for verifying local dev servers or a deployment, never general web browsing. Only localhost/127.0.0.1 URLs or a workspace\'s own recorded deployment URL are allowed.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An id you choose to identify this browser session (reuse it for refresh/console/network/screenshot calls on the same window).' },
        url: { type: 'string', description: 'The URL to open, e.g. http://localhost:3000.' },
      },
      required: ['sessionId', 'url'],
    },
  },
  {
    name: 'refresh_dev_browser',
    description: 'Reload the page in an open Development Browser session.',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id used to open it.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'read_browser_console',
    description: 'Read recent console output (including errors) from an open Development Browser session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id used to open it.' },
        maxEntries: { type: 'number', description: 'Optional cap on how many recent entries to return.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'read_browser_network_errors',
    description: 'Read failed network requests (4xx/5xx or load failures) from an open Development Browser session.',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id used to open it.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'capture_browser_screenshot',
    description: 'Take a screenshot of an open Development Browser session — e.g. to visually verify a page rendered correctly.',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id used to open it.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'dev_browser_preview',
    description:
      "\"Browser Preview\" + \"Browser Console\" for the Coding Canvas — a real screenshot plus real console log entries from an open Development Browser session (opened via open_dev_browser). Paw Pro only. Distinct from capture_browser_screenshot/read_browser_console, which only work on general Browser Runtime sessions, not Development Browser ones.",
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id used with open_dev_browser.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'fill_dev_form',
    description:
      'Fill in (and optionally submit) a form in an open Development Browser session — e.g. a local dev login form. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id used to open it.' },
        fields: {
          type: 'array',
          description: 'CSS selector + value pairs to fill in.',
          items: {
            type: 'object',
            properties: { selector: { type: 'string' }, value: { type: 'string' } },
            required: ['selector', 'value'],
          },
        },
        submitSelector: { type: 'string', description: 'Optional CSS selector of a submit button to click afterward.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['sessionId', 'fields'],
    },
  },
  {
    name: 'download_project_file',
    description: 'Download a file from a URL (localhost/127.0.0.1 or a recorded deployment URL only) and save it to disk.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'A session id (for consistency with other dev-browser calls; does not need an already-open window).' },
        url: { type: 'string', description: 'URL to download from.' },
        savePath: { type: 'string', description: 'Absolute path to save the downloaded file to.' },
      },
      required: ['sessionId', 'url', 'savePath'],
    },
  },
  {
    name: 'upload_project_file',
    description: 'Attach a local file to a file input in an open Development Browser session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id used to open it.' },
        selector: { type: 'string', description: 'CSS selector of the <input type="file"> element.' },
        filePath: { type: 'string', description: 'Absolute path of the local file to attach.' },
      },
      required: ['sessionId', 'selector', 'filePath'],
    },
  },
  {
    name: 'browse_web',
    description:
      'Open or navigate a real browser session to ANY website — not just localhost/deployment URLs, general web browsing. The first navigation to a new, non-local site for a given session needs the user\'s approval (do not set `confirmed` yourself); once approved, that same session can keep navigating without asking again. Use this — not open_dev_browser — for real-world tasks like booking, shopping, reading docs, or working with any external site.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An id you choose to identify this browser tab — reuse the same id to keep working in the same tab, or a new one to open another.' },
        url: { type: 'string', description: 'Full http(s) URL to open.' },
        browser: {
          type: 'string',
          enum: ['chrome', 'edge', 'brave', 'firefox', 'electron'],
          description: "Optional: which real browser to use for this tab. Omit to auto-pick (Chrome, then Edge, then Brave, then Paw's own browser — whichever is actually installed). Once picked for a sessionId, every later action on that same id keeps using it. Firefox only supports opening/navigating and downloads — no reading, clicking, or filling.",
        },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['sessionId', 'url'],
    },
  },
  {
    name: 'search_web',
    description: 'Search the web for a query and get back real result titles/URLs/snippets. Always safe, never needs confirmation — uses a fixed trusted search engine.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An id you choose to identify this browser tab.' },
        query: { type: 'string', description: 'What to search for.' },
        browser: { type: 'string', enum: ['chrome', 'edge', 'brave', 'firefox', 'electron'], description: 'Optional: which real browser to search in. Omit to auto-pick.' },
      },
      required: ['sessionId', 'query'],
    },
  },
  {
    name: 'list_available_browsers',
    description: "Check which real browsers (Chrome, Edge, Brave, Firefox) are actually installed on the user's computer, plus Paw's own built-in browser. Use this before browse_web if you're unsure what's available, or when the user asks what browsers you can use.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'set_preferred_browser_order',
    description:
      'Set which real browser Paw should prefer when a request doesn\'t name one — e.g. "prefer Edge over Chrome" or "always use Brave if it\'s installed." Paw walks this list in order and uses the first one actually installed, falling back to its own browser if none are.',
    parameters: {
      type: 'object',
      properties: {
        order: {
          type: 'array',
          items: { type: 'string', enum: ['chrome', 'edge', 'brave', 'firefox', 'electron'] },
          description: 'Browsers in preferred order, most preferred first.',
        },
      },
      required: ['order'],
    },
  },
  {
    name: 'get_browser_history',
    description: 'Get pages Paw has visited on the user\'s behalf, most recent first — answers things like "show what I read yesterday." This is Paw\'s own browsing record, not the real browser\'s history file.',
    parameters: {
      type: 'object',
      properties: {
        since: { type: 'number', description: 'Optional: only visits after this Unix timestamp (ms).' },
        until: { type: 'number', description: 'Optional: only visits before this Unix timestamp (ms).' },
        limit: { type: 'number', description: 'Optional cap on how many results to return.' },
      },
    },
  },
  {
    name: 'bookmark_page',
    description: 'Bookmark a page — either the current page in an open browser session, or an explicit URL. Saved in Paw\'s own memory, not the real browser\'s bookmarks.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An open browser session to bookmark the current page of.' },
        url: { type: 'string', description: 'Explicit URL to bookmark, if not using an open session.' },
        label: { type: 'string', description: 'Optional short label for this bookmark.' },
      },
    },
  },
  {
    name: 'list_bookmarks',
    description: "List every page the user has asked Paw to bookmark.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'record_page_summary',
    description:
      "Remember what a page actually said, in your own words, after you've genuinely read or extracted its real content — never before that, never guessed from the URL alone. Call this after research, company lookups, documentation reading, or comparison shopping so a later question (or a later research task) can be answered from memory instead of re-browsing the same page. This is Paw's own understanding, separate from bookmarking.",
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An open browser session whose current page this summary is about.' },
        url: { type: 'string', description: 'Explicit URL this summary is about, if not using an open session.' },
        summary: { type: 'string', description: "Your own concise synthesis of what the page actually said — the real findings, not a description of the page's layout." },
      },
      required: ['summary'],
    },
  },
  {
    name: 'search_browser_memory',
    description:
      "Check what Paw already remembers before starting new research — searches previously recorded page summaries, titles, and URLs. Use this FIRST when a task sounds like something you may have already looked into, to avoid redundant browsing.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to search for in remembered research.' } },
      required: ['query'],
    },
  },
  {
    name: 'run_comparison_workflow',
    description:
      "The Comparison Engine's mechanical step — use this instead of manually calling browse_web/extract_page_data once per candidate. Deterministically opens one real browser session per candidate, extracts structured data from each (links/headings, or your given selectors), and closes every temporary tab afterward. One candidate failing never aborts the rest — check the returned outcomes for which succeeded and which failed. After this returns, normalize the real extracted values yourself, reason over them to rank and recommend, then call record_comparison. If some candidates failed, you can retry by calling this again with only the failed candidates' name/url. Check get_comparison first if this sounds like something already compared recently.",
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What is being compared, e.g. "13-inch laptops under $1000".' },
        candidates: {
          type: 'array',
          description: 'Each candidate to open and extract from.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['name', 'url'],
          },
        },
        selectors: { type: 'array', items: { type: 'string' }, description: 'Optional CSS selectors to extract from each candidate page. Omit to get a generic default (links + headings).' },
        browser: { type: 'string', enum: ['chrome', 'edge', 'brave', 'firefox', 'electron'], description: 'Optional specific browser to use for every candidate session.' },
      },
      required: ['topic', 'candidates'],
    },
  },
  {
    name: 'record_comparison',
    description:
      "The Comparison Engine's save step. Call this after opening multiple candidates' real pages — normally via run_comparison_workflow — extracting real structured values from each, and reasoning over those real values to rank them — never before that, never with invented values. Saves the comparison so it can be recalled later without re-browsing.",
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What is being compared, e.g. "13-inch laptops under $1000".' },
        candidates: {
          type: 'array',
          description: 'Each candidate with the real values you actually extracted from its page.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
              values: { type: 'object', description: 'Real extracted attribute-value pairs, e.g. {"price": "$999", "ram": "16GB"}.' },
            },
            required: ['name', 'url', 'values'],
          },
        },
        ranking: { type: 'array', items: { type: 'string' }, description: 'Candidate names in ranked order, best first.' },
        recommendation: { type: 'string', description: 'Your recommendation and why, grounded in the real extracted values.' },
      },
      required: ['topic', 'candidates', 'ranking', 'recommendation'],
    },
  },
  {
    name: 'get_comparison',
    description: "Check whether Paw already compared these before, to avoid redoing work that's still fresh.",
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'What was being compared.' } },
      required: ['topic'],
    },
  },
  {
    name: 'checkpoint_research',
    description:
      "Long Running Research's checkpoint. Call this whenever pausing a research task, whenever you learn a genuine new finding worth remembering, and when the research concludes with a final report. `finding`, when given, is appended to what's already known about this topic — it never replaces prior findings.",
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The research topic/goal this checkpoint belongs to.' },
        status: { type: 'string', enum: ['in_progress', 'paused', 'completed'], description: 'Current state of this research task.' },
        finding: { type: 'string', description: 'A new real finding to add to what is already known, if any.' },
        nextSteps: { type: 'string', description: "What to do next when this research resumes — your own note to your future self." },
        finalReport: { type: 'string', description: 'Only when status is completed: the full synthesized report of everything found.' },
      },
      required: ['topic', 'status'],
    },
  },
  {
    name: 'get_research_status',
    description: "Call this FIRST when resuming, continuing, or checking on a research topic — before any new browsing — to see real accumulated findings and the next step you noted for yourself.",
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'The research topic to check.' } },
      required: ['topic'],
    },
  },
  {
    name: 'get_browser_cookies',
    description: "Read the real cookies for an open browser session. Destructive — always asks the user to confirm first, since cookies can carry session tokens.",
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The open browser session to read cookies from.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'reuse_existing_browser_session',
    description:
      'Open a URL in the user\'s REAL Chrome/Edge/Brave (not Paw\'s own sandboxed browser), reusing whatever they\'re already logged into there — e.g. "reuse my existing login for GitHub." Only works for chrome/edge/brave (never firefox/electron), and fails honestly if that browser is already open with the same profile (it locks its own profile directory — ask the user to close it first). Always asks the user to confirm first, since this exposes real logged-in sessions.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'An id you choose to identify this tab.' },
        url: { type: 'string', description: 'Full http(s) URL to open.' },
        browser: { type: 'string', enum: ['chrome', 'edge', 'brave'] },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['sessionId', 'url', 'browser'],
    },
  },
  {
    name: 'print_browser_page_to_pdf',
    description: 'Save/print the current page of an open browser session as a real PDF file — e.g. "save this webpage as PDF" or "print this invoice." Registers the saved file with File Runtime like any other generated document.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The open browser session showing the page to save.' },
        savePath: { type: 'string', description: 'Absolute path to save the PDF to.' },
        confirmed: { type: 'boolean', description: 'Set true only if the user already confirmed overwriting an existing file at this path.' },
      },
      required: ['sessionId', 'savePath'],
    },
  },
  {
    name: 'read_web_page',
    description: 'Read the real visible text of the currently-open page in a browser session. Use this before summarizing or reasoning about a page\'s content — never guess at what a page says.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        maxChars: { type: 'number', description: 'Optional cap on how much text to return.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'extract_page_data',
    description: 'Extract structured data from the current page — either everything matching given CSS selectors, or (with no selectors) a generic default of links and headings. Real DOM queries, not a guess.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selectors: { type: 'array', description: 'Optional CSS selectors to extract matching elements for.', items: { type: 'string' } },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'click_element',
    description: 'Click a real element on the page by CSS selector. Fails honestly if the element isn\'t found. To confirm what the click actually did (a navigation, a new element appearing), follow up with wait_for_browser_state.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selector: { type: 'string', description: 'CSS selector of the element to click.' },
      },
      required: ['sessionId', 'selector'],
    },
  },
  {
    name: 'scroll_browser_page',
    description: 'Scroll the page, either by a pixel amount in a direction or by bringing a specific element into view.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selector: { type: 'string', description: 'Optional CSS selector to scroll into view instead of a plain scroll.' },
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction when no selector is given.' },
        amount: { type: 'number', description: 'Pixels to scroll when no selector is given.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'wait_for_browser_state',
    description:
      'Wait until a real condition is true — a CSS selector appears, and/or the URL contains a substring — polling for up to a timeout. This is how you VERIFY a prior action (a click, a form submit, a navigation) actually had its intended effect, instead of assuming it. Always use this after an action whose success matters before continuing.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selector: { type: 'string', description: 'CSS selector that should appear.' },
        urlContains: { type: 'string', description: 'Substring the URL should contain.' },
        timeoutMs: { type: 'number', description: 'How long to wait before giving up, in milliseconds. Defaults to 15000.' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'fill_browser_form',
    description:
      'Fill in real form fields on ANY website (not just localhost) and optionally submit. Destructive — PawOS will always ask the user to confirm before submitting, since this can trigger a real purchase, login, or account action.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        fields: {
          type: 'array',
          description: 'CSS selector + value pairs to fill in.',
          items: {
            type: 'object',
            properties: { selector: { type: 'string' }, value: { type: 'string' } },
            required: ['selector', 'value'],
          },
        },
        submitSelector: { type: 'string', description: 'Optional CSS selector of a submit button to click afterward.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['sessionId', 'fields'],
    },
  },
  {
    name: 'upload_browser_file',
    description: 'Attach a local file to a file input on ANY website (not just localhost).',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selector: { type: 'string', description: 'CSS selector of the <input type="file"> element.' },
        filePath: { type: 'string', description: 'Absolute path of the local file to attach.' },
      },
      required: ['sessionId', 'selector', 'filePath'],
    },
  },
  {
    name: 'download_browser_file',
    description:
      'Download a real file from ANY website — either by clicking a selector that triggers a download, or a direct URL. Verified: only reported successful once the file genuinely exists on disk with real bytes, never assumed.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selector: { type: 'string', description: 'CSS selector of an element that triggers a download when clicked (e.g. a "Download PDF" link).' },
        url: { type: 'string', description: 'Alternative to selector — a direct URL to download.' },
        savePath: { type: 'string', description: 'Absolute path to save the downloaded file to.' },
      },
      required: ['sessionId', 'savePath'],
    },
  },
  {
    name: 'list_browser_tabs',
    description: 'List every currently open browser tab (session) and the URL it\'s on.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'close_browser_tab',
    description: 'Close a browser tab (session) that\'s no longer needed.',
    parameters: {
      type: 'object',
      properties: { sessionId: { type: 'string', description: 'The session id of the tab to close.' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'build_project',
    description: 'Run a project\'s build command and verify it actually produced build output. Not destructive.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the project directory.' },
        buildCommand: { type: 'string', description: 'The build command to run, e.g. "npm run build".' },
        timeoutMs: { type: 'number', description: 'Optional max time to wait for the build to finish.' },
      },
      required: ['cwd', 'buildCommand'],
    },
  },
  {
    name: 'read_env_vars',
    description: 'List the environment variable NAMES set in a .env file (never their values, since those commonly hold secrets). Not destructive.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path of the .env file.' } },
      required: ['path'],
    },
  },
  {
    name: 'write_env_var',
    description:
      'Set one environment variable in a .env file (creates the file if needed), leaving every other line untouched. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the .env file.' },
        key: { type: 'string', description: 'The variable name to set.' },
        value: { type: 'string', description: 'The value to set it to.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['path', 'key', 'value'],
    },
  },
  {
    name: 'run_deploy_script',
    description:
      'Run a project\'s own already-configured deploy command (e.g. a package.json "deploy" script, or a Vercel/Netlify CLI command) — never invents deployment infrastructure. Destructive — PawOS will always ask the user to confirm before doing this, regardless of what is requested.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path of the project directory.' },
        command: { type: 'string', description: 'The deploy command to run.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['cwd', 'command'],
    },
  },
  {
    name: 'verify_deployment',
    description: 'Check that a deployed site or local server actually responds over HTTP. Only localhost/127.0.0.1 or a recorded deployment URL are allowed.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to check.' },
        timeoutMs: { type: 'number', description: 'Optional max time to wait.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'record_error_fix',
    description:
      'Remember a problem and how you actually fixed it, once you have confirmed the fix really worked (via real verification, not just a hopeful guess). Call this so the same problem can be fixed faster next time.',
    parameters: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string', description: 'Absolute root path of the project this happened in.' },
        problem: { type: 'string', description: 'What went wrong, in plain language (e.g. the error message).' },
        cause: { type: 'string', description: 'The actual root cause you identified.' },
        solution: { type: 'string', description: 'What you did to fix it.' },
        filesChanged: { type: 'array', items: { type: 'string' }, description: 'Files you changed to fix it.' },
        commandsUsed: { type: 'array', items: { type: 'string' }, description: 'Commands you ran as part of the fix.' },
        verification: { type: 'string', description: 'How you confirmed the fix actually worked.' },
      },
      required: ['workspaceRoot', 'problem', 'cause', 'solution'],
    },
  },
  {
    name: 'find_similar_errors',
    description: "Check whether a similar problem has been fixed before, so you can try that fix first instead of guessing from scratch. Call this before attempting a fresh fix for an error.",
    parameters: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: 'The current problem/error message to search for.' },
        workspaceRoot: { type: 'string', description: 'Optional — restrict the search to this project only.' },
      },
      required: ['problem'],
    },
  },
  {
    name: 'analyze_reference_image',
    description:
      'Actually look at reference image(s) the user attached (screenshots, UI mockups, wireframes, logos, or design references) using real vision analysis — sections, layout, colors, typography, components, navigation pattern. Call this whenever the user attaches/pastes a reference image, before building anything from it. Never guess an image\'s contents. Every image attached this task stays available: pass imageIndex to look at one specific image (1-based, matching "Image 1," "Image 2," ...), or omit it to analyze the whole attached set together as one reference (recommended when the user refers to the images collectively, e.g. a logo plus product photos for one homepage).',
    parameters: {
      type: 'object',
      properties: {
        imageIndex: { type: 'number', description: 'Optional. 1-based index of one specific attached image to look at. Omit to analyze every attached image together as one reference set.' },
      },
      required: [],
    },
  },
  {
    name: 'extract_page_structure',
    description:
      'Real DOM/CSS structural analysis of the current page for URL Intelligence — computed styles (colors, fonts, spacing, shadows), real bounding-box measurements for key elements (headers/nav/sections/cards/buttons/forms), and real @media breakpoint values from the page\'s own stylesheets. Use this (not extract_page_data) when the goal is understanding a page\'s visual design language to reuse, not just its text content.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab.' },
        selectors: { type: 'array', description: 'Optional CSS selectors to focus the structural analysis on.', items: { type: 'string' } },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'optimize_image',
    description: 'Compress a real image file (jpeg/webp) to reduce its size while keeping it usable in a project — writes a new file, never overwrites the original.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the source image.' },
        outputPath: { type: 'string', description: 'Optional destination path — defaults next to the source with a suffix.' },
        format: { type: 'string', enum: ['jpeg', 'webp'], description: 'Output format. Defaults to webp.' },
        quality: { type: 'number', description: 'Compression quality 1-100. Defaults to 80.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_thumbnail',
    description: 'Generate a real resized thumbnail from an image file — writes a new file, never overwrites the original.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the source image.' },
        outputPath: { type: 'string', description: 'Optional destination path — defaults next to the source with a suffix.' },
        width: { type: 'number', description: 'Thumbnail width in pixels. Defaults to 200.' },
        height: { type: 'number', description: 'Thumbnail height in pixels. Defaults to 200.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_responsive_variants',
    description: 'Generate real resized copies of an image at standard responsive breakpoint widths (480/768/1280/1920 by default) for use in a website\'s responsive images — writes new files, never overwrites the original.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the source image.' },
        outputDir: { type: 'string', description: 'Optional output directory — defaults to the source image\'s own directory.' },
        widths: { type: 'array', items: { type: 'number' }, description: 'Optional list of target widths in pixels.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_alt_text',
    description: 'Generate a real, concrete alt-text description for an image asset using vision analysis of what is actually in it — for accessibility, never invented.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the image.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'organize_asset',
    description: 'Place a dropped-in asset file into a sensible location within a project (e.g. images into public/images/, fonts into public/fonts/) — copies the asset to that location, never deletes or moves the original. Only ask the user where an asset belongs if there is genuine, real ambiguity.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the asset file.' },
        projectRoot: { type: 'string', description: 'Absolute path of the project root to organize the asset into.' },
      },
      required: ['path', 'projectRoot'],
    },
  },
  {
    name: 'verify_rendered_ui',
    description:
      'Visually verify a real, already-open browser preview — captures a real screenshot, reads real console errors and network failures, measures real layout/overflow issues, and checks the screenshot with vision analysis. Returns real issues found, never a guess. Call this after a build before telling the user the UI is done.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id of an already-open browser tab showing the rendered page.' },
      },
      required: ['sessionId'],
    },
  },
  // Communication Intelligence Runtime — capture, memory, timeline, search.
  // `medium` is always one of the real registered source ids (see the
  // system prompt's Communication Intelligence section for the current
  // list) — never invented. audioPath/apiKey/participants/companies/
  // projects are all resolved by the runtime, never model-supplied.
  {
    name: 'start_communication_capture',
    description:
      'Begin recording a real conversation — a face-to-face meeting, phone call, voice note, or a detected Google Meet/Zoom/Teams/Webex call. Only call this after the user explicitly says to start recording (e.g. "start recording") — never start capturing a conversation the user hasn\'t asked to record. For meetings and phone calls, this needs consentConfirmed=true (see the consent-required requirement message) before it can actually start — never set it true without the user having genuinely confirmed that.',
    parameters: {
      type: 'object',
      properties: {
        medium: { type: 'string', description: 'The communication source id: faceToFace, phoneCall, voiceNote, googleMeet, zoom, teams, or webex.' },
        title: { type: 'string', description: 'Optional title, e.g. "Call with Acme Corp" — inferred if omitted.' },
        consentConfirmed: { type: 'boolean', description: 'For meetings/phone calls only — true only once the user has explicitly confirmed they have the other participants\' consent to record.' },
      },
      required: ['medium'],
    },
  },
  {
    name: 'stop_communication_capture',
    description: 'Finish a real, active recording — call this the moment the user says "stop." Always follow this in the same turn with process_communication so the recording actually gets transcribed and summarized, never leaving it unprocessed.',
    parameters: {
      type: 'object',
      properties: { communicationId: { type: 'string', description: 'The id returned by start_communication_capture.' } },
      required: ['communicationId'],
    },
  },
  {
    name: 'pause_communication_capture',
    description: 'Pause an active recording without ending it.',
    parameters: { type: 'object', properties: { communicationId: { type: 'string' } }, required: ['communicationId'] },
  },
  {
    name: 'resume_communication_capture',
    description: 'Resume a paused recording.',
    parameters: { type: 'object', properties: { communicationId: { type: 'string' } }, required: ['communicationId'] },
  },
  {
    name: 'process_communication',
    description: 'Transcribe and analyze a stopped recording — produces a real transcript, summary, action items, follow-ups, and (for business conversations) any real buying signals/decision-makers found. Call this immediately after stop_communication_capture.',
    parameters: { type: 'object', properties: { communicationId: { type: 'string' } }, required: ['communicationId'] },
  },
  {
    name: 'get_communication',
    description: 'Look up one specific communication record by id.',
    parameters: { type: 'object', properties: { communicationId: { type: 'string' } }, required: ['communicationId'] },
  },
  {
    name: 'get_communication_timeline',
    description: 'The Unified Communication Timeline — meetings, calls, voice notes, and follow-ups in chronological order, optionally scoped to one participant/company/project/date range/medium. Use this for "what have I talked about with X" style questions.',
    parameters: {
      type: 'object',
      properties: {
        participantId: { type: 'string' },
        companyId: { type: 'string' },
        projectId: { type: 'string' },
        medium: { type: 'string' },
        dateFrom: { type: 'number', description: 'Millisecond timestamp.' },
        dateTo: { type: 'number', description: 'Millisecond timestamp.' },
      },
      required: [],
    },
  },
  {
    name: 'get_company_workspace',
    description: 'Everything for one company in one place — meetings, calls, files, open action items, timeline, real relationship health, frequently discussed topics, risks, and opportunities.',
    parameters: {
      type: 'object',
      properties: {
        companyId: { type: 'string' },
        companyName: { type: 'string', description: 'Real company name, when you don\'t already have its id.' },
      },
      required: [],
    },
  },
  {
    name: 'get_contact_history',
    description: 'Everything real Communication Memory knows about one person — relationship health, frequently discussed topics, communication style, interests, real communication history, and open action items. Use for questions like "who normally attends these meetings" or "summarize my history with X".',
    parameters: {
      type: 'object',
      properties: {
        participantId: { type: 'string' },
        participantName: { type: 'string', description: 'Real person\'s name, when you don\'t already have their id.' },
      },
      required: [],
    },
  },
  {
    name: 'search_communications',
    description: 'Search past communications — supports a natural-language question ("what did Sarah say about pricing last month") as well as plain keyword search, always narrowed by any real participant/company/project/date filters first.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'A natural-language question or keywords.' },
        participantId: { type: 'string' },
        companyId: { type: 'string' },
        projectId: { type: 'string' },
        medium: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'add_communication_note',
    description: "Attach the user's own free-text note to a communication — kept separate from the auto-generated summary.",
    parameters: {
      type: 'object',
      properties: { communicationId: { type: 'string' }, note: { type: 'string' } },
      required: ['communicationId', 'note'],
    },
  },
  {
    name: 'confirm_communication_action_items',
    description: 'The user has explicitly said yes to tracking specific detected action items — never call this without that explicit confirmation.',
    parameters: {
      type: 'object',
      properties: {
        communicationId: { type: 'string' },
        actionItemIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['communicationId', 'actionItemIds'],
    },
  },
  {
    name: 'begin_mobile_pairing',
    description: 'Generate a real pairing code for the Paw mobile companion app, to record phone calls from a paired phone.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_paired_devices',
    description: 'List every mobile device currently paired.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'unpair_device',
    description: 'Revoke pairing for one specific mobile device.',
    parameters: { type: 'object', properties: { deviceId: { type: 'string' } }, required: ['deviceId'] },
  },
  {
    name: 'get_email_preferences',
    description: 'Check the user\'s saved email preferences (display name, email address, preferred provider). This is a plain preference, not a login — used only to pick which compose URL to open.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_email_preferences',
    description: 'Save the user\'s email preferences — display name, email address, and which provider\'s compose window to open (gmail/outlook/microsoft365/googleWorkspace/default). This is NOT a login or connected account and never involves a password — only call this once the user has told you their real email address and preferred provider.',
    parameters: {
      type: 'object',
      properties: {
        displayName: { type: 'string' },
        emailAddress: { type: 'string' },
        provider: { type: 'string', enum: ['gmail', 'outlook', 'microsoft365', 'googleWorkspace', 'default'] },
      },
      required: ['displayName', 'emailAddress', 'provider'],
    },
  },
  {
    name: 'get_coding_mode',
    description: 'Check whether the user is currently in Paw Go (planning/analysis only, read-only Coding Canvas) or Paw Pro (full code generation, execution, build/test). This is a local capability preference, not a purchased plan or billing check.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_coding_mode',
    description: 'Switch the local Paw Go/Paw Pro coding mode preference. Only call this when the user explicitly asks to switch modes (e.g. "switch to Pro" / "go back to Go mode") — never switch modes on your own initiative.',
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['go', 'pro'] } },
      required: ['mode'],
    },
  },
  {
    name: 'set_task_checklist',
    description:
      "Declare or update the current coding task's checklist for the Coding Canvas's \"Live TODO Progress\" section. Call once near the start of a multi-step coding task with the full planned item list (status 'pending'), then re-call with the SAME items (updated statuses: 'inProgress'/'done'/'skipped') as you make real progress — never mark an item done before it's actually done. Skip this for single-step requests.",
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'inProgress', 'done', 'skipped'] },
            },
            required: ['id', 'label', 'status'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'draft_followup_email',
    description: 'Generate a real follow-up email draft grounded in one session\'s real summary/action items/decisions — never sends anything, only produces a preview for the user to review.',
    parameters: {
      type: 'object',
      properties: {
        communicationId: { type: 'string' },
      },
      required: ['communicationId'],
    },
  },
  {
    name: 'list_email_drafts',
    description: 'List every follow-up email draft that has been generated across sessions, with its current per-recipient send status.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'open_mail_compose_window',
    description: 'Opens a prefilled compose window in the user\'s own real browser (or OS default mail app) for one recipient. This never sends anything — Paw only opens the window; the user clicks Send themselves. Always follow up by asking the user to confirm once they\'ve actually sent it before calling confirm_email_sent.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['recipient', 'subject', 'body'],
    },
  },
  {
    name: 'confirm_email_sent',
    description: 'Records that the user explicitly confirmed they sent a follow-up email to one or more recipients. NEVER call this just because a compose window was opened — only call it after the user directly says they sent it.',
    parameters: {
      type: 'object',
      properties: {
        communicationId: { type: 'string' },
        draftId: { type: 'string' },
        recipients: { type: 'array', items: { type: 'string' } },
      },
      required: ['communicationId', 'draftId', 'recipients'],
    },
  },
  {
    name: 'deploy_project',
    description:
      'Host or deploy a project without naming a provider — "host my website," "deploy this SaaS." Only works when the project has no deploy script of its own (if it does, use run_deploy_script instead — never both) AND a hosting connector (Vercel/Netlify) is actually configured; if neither is true, this returns an honest message saying so, never a fabricated deployment. Always confirm before setting confirmed: true — this is production-impacting.',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Absolute path to the project to deploy.' },
        environment: { type: 'string', enum: ['production', 'staging', 'preview'], description: 'Defaults to production.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['cwd'],
    },
  },
  {
    name: 'rollback_deployment',
    description:
      '"Rollback yesterday\'s deployment" — reverts a service to the deployment recorded immediately before its current one, using whichever hosting connector performed the original deploy. Fails honestly if there is no previous deployment on record. Always confirm before setting confirmed: true — production-impacting.',
    parameters: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', description: 'The service to roll back, as recorded by a prior deploy_project call.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['serviceName'],
    },
  },
  {
    name: 'promote_deployment',
    description:
      '"Promote staging to production" — finds the most recent non-production deployment recorded for a service and promotes it to production through the same hosting connector that built it, without a new build when the provider supports it (real Vercel promote / Netlify publish-existing-deploy). Fails honestly if there is no staging/preview deployment on record. Always confirm before setting confirmed: true — production-impacting.',
    parameters: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', description: 'The service whose staging/preview deployment should be promoted, as recorded by a prior deploy_project call.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['serviceName'],
    },
  },
  {
    name: 'get_deployment_status',
    description:
      'Read-only "is it deployed, is CI green" check for a service — tries a configured CI/CD connector\'s latest run status first, falls back to the last recorded deployment. Never gated, never fabricates a status when nothing is on record.',
    parameters: {
      type: 'object',
      properties: {
        serviceName: { type: 'string' },
        repo: { type: 'string', description: 'Optional "owner/repo" to check CI/CD status for, if different from serviceName.' },
        branch: { type: 'string' },
      },
      required: ['serviceName'],
    },
  },
  {
    name: 'list_configured_infra_connectors',
    description:
      'Read-only "what is actually connected right now" across source control, project management, CI/CD, hosting, and detected local cloud/container CLIs. Call this before attempting a deploy/investigate/ticket action when you are not sure anything is configured, instead of guessing or trying blind.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_approval_queue',
    description: "Read-only check of what's currently waiting on the user's approval (a deploy/rollback/promote that returned requires-confirmation and hasn't been answered yet). Never gated.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_engineering_memory',
    description: 'Read-only list of the most recent deployments/rollbacks/incidents Paw has recorded, across every service. Use this for "what have we deployed recently" or "show deployment history" style questions.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_infrastructure_graph_summary',
    description: 'Read-only "how does this service relate to everything else I know about" — real stored relationships only (repository, domain, database, deployments), never a guess. Use for "what does X depend on" or "what is connected to Y" questions.',
    parameters: {
      type: 'object',
      properties: { serviceName: { type: 'string', description: 'A service already registered via a prior deploy_project/investigate_ticket call.' } },
      required: ['serviceName'],
    },
  },
  {
    name: 'investigate_ticket',
    description:
      'Enterprise Ticket Intelligence — reads a real ticket from whichever configured project management connector (Jira/Linear/GitHub Issues) has it, and if given a project cwd, gathers real evidence: project context, latest commit, a live health check if the matched service has a registered domain, real browser console errors and network failures captured from actually opening the live application when that health check passes, and relatedHistory (prior deployments/rollbacks/incidents already on record for that service). Never diagnoses a root cause or proposes a fix itself — it only gathers real, verifiable evidence; you reason over that evidence afterward and, if you decide on a fix, make it through the normal gated write_file/git_commit/deploy_project/promote_deployment calls with their own confirmations. Read-only, never gated.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'The ticket identifier, e.g. "PROJ-123", "owner/repo#42", or a Linear issue id.' },
        cwd: { type: 'string', description: 'Optional path to the related project, to gather project/commit/health evidence.' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'investigate_production_issue',
    description:
      'The Autonomous Engineering Loop\'s entry point for a reported issue with no ticket — "Fix production," "Production is slow," "Users cannot login," "Payment is failing," "Rollback production" (investigate first, before deciding to roll back). Same real evidence-gathering and Root Cause Engine correlation as investigate_ticket, just starting from a free-text description. Never proposes a fix itself. Read-only, never gated.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What the user actually said is wrong, in their own words.' },
        cwd: { type: 'string', description: 'The related project, so I can find the right service to investigate.' },
      },
      required: ['description', 'cwd'],
    },
  },
  {
    name: 'compare_deployments',
    description: 'Deployment Intelligence\'s deployment comparison — diffs the two most recent real deployment records for a service (status, environment, hosting connector, time between them). Fails honestly if fewer than 2 deployments are on record. Never gated.',
    parameters: {
      type: 'object',
      properties: { serviceName: { type: 'string' } },
      required: ['serviceName'],
    },
  },
  {
    name: 'discover_infrastructure',
    description:
      'Infrastructure Discovery Engine — lists real repositories from every configured source control connector and registers each in the infrastructure graph. Only discovers what a configured connector can actually see; never invents a service, deployment, or domain that hasn\'t actually been seen yet. Never gated.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_infrastructure',
    description: 'Infrastructure Search — a real substring search across every registered infrastructure entity (repositories, services, deployments, databases, clusters, domains, incidents, and more). Never gated.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_infra_mode',
    description: "Check the local Infrastructure Runtime mode — 'investigate' (read-only: tickets, status, health) or 'full' (deploy/rollback available when confirmed).",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_infra_mode',
    description: "Switch the local Infrastructure Runtime mode. Only call this when the user explicitly asks to switch (e.g. \"enable full infrastructure mode\") — never switch on your own initiative.",
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['investigate', 'full'] } },
      required: ['mode'],
    },
  },
  {
    name: 'merge_pdfs',
    description: 'Document Intelligence — merges two or more real PDF files, byte-for-byte, into one output PDF via pdf-lib. Always confirm before setting confirmed: true if the output path already exists.',
    parameters: {
      type: 'object',
      properties: {
        inputPaths: { type: 'array', items: { type: 'string' }, description: 'Absolute paths to the PDFs to merge, in order.' },
        outputPath: { type: 'string', description: 'Absolute path for the merged output PDF.' },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['inputPaths', 'outputPath'],
    },
  },
  {
    name: 'create_docx',
    description: 'Document Intelligence — creates a real .docx file (via the docx library) with a title and one or more headed sections of paragraphs. Always confirm before setting confirmed: true if the output path already exists.',
    parameters: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute path for the new .docx file.' },
        title: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } },
            required: ['paragraphs'],
          },
        },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['outputPath', 'sections'],
    },
  },
  {
    name: 'create_spreadsheet',
    description: 'Spreadsheet Intelligence — creates a real .xlsx workbook (via SheetJS) with one or more named sheets of row data, and optionally real cell formulas. Never claims to add a chart — the underlying library can\'t write those; say so honestly if asked. Always confirm before setting confirmed: true if the output path already exists.',
    parameters: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute path for the new .xlsx file.' },
        sheets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              rows: { type: 'array', items: { type: 'array' } },
              formulas: { type: 'array', items: { type: 'object', properties: { cell: { type: 'string' }, formula: { type: 'string' } }, required: ['cell', 'formula'] } },
            },
            required: ['name', 'rows'],
          },
        },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['outputPath', 'sheets'],
    },
  },
  {
    name: 'analyze_spreadsheet',
    description: 'Spreadsheet Intelligence — reads a real .xlsx file and computes real per-column statistics (count/sum/average/min/max for numeric columns). Read-only, never gated, never fabricates a pivot table or chart.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to the .xlsx file to analyze.' },
        sheetName: { type: 'string', description: 'Defaults to the first sheet if omitted.' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'create_presentation',
    description: 'Presentation Intelligence — creates a real .pptx (via pptxgenjs) with real slides, speaker notes, an optional theme, and real rendered charts (bar/line/pie/doughnut/area) — never a static image pretending to be a chart. Always confirm before setting confirmed: true if the output path already exists.',
    parameters: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute path for the new .pptx file.' },
        theme: { type: 'object', properties: { primaryColor: { type: 'string' }, backgroundColor: { type: 'string' } } },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' },
              chart: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut', 'area'] },
                  categories: { type: 'array', items: { type: 'string' } },
                  series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, required: ['name', 'values'] } },
                },
                required: ['kind', 'categories', 'series'],
              },
            },
          },
        },
        confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION },
      },
      required: ['outputPath', 'slides'],
    },
  },
  {
    name: 'list_recent_office_files',
    description: 'Read-only "what have I recently created or edited" across documents, spreadsheets, and presentations. Never gated.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'confirm_general_email_sent',
    description: 'Records that the user explicitly confirmed they sent an email drafted via open_mail_compose_window. NEVER call this just because a compose window was opened — only call it after the user directly says they sent it. General-purpose (not tied to a Communication Runtime session) — use confirm_email_sent instead for a meeting/call follow-up email.',
    parameters: {
      type: 'object',
      properties: { recipient: { type: 'string' }, subject: { type: 'string' } },
      required: ['recipient', 'subject'],
    },
  },
  {
    name: 'record_companion_goal',
    description: 'Companion Memory — remembers a real goal the user told you about (e.g. "remember that I\'m trying to launch by Friday"). Always tied to whichever companion is currently active; you never need to know or pass a companion id.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'list_companion_goals',
    description: 'Read-only list of goals remembered for the currently active companion. Never gated.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'complete_companion_goal',
    description: 'Marks a previously remembered goal as done, once the user says they finished it.',
    parameters: {
      type: 'object',
      properties: { goalId: { type: 'string', description: 'The goal id from a prior record_companion_goal/list_companion_goals call.' } },
      required: ['goalId'],
    },
  },
  {
    name: 'record_companion_routine',
    description: 'Companion Memory — remembers a recurring routine the user told you about (e.g. "I check email every morning at 9"). Always tied to the currently active companion.',
    parameters: {
      type: 'object',
      properties: { description: { type: 'string' }, cadence: { type: 'string', description: 'Optional, e.g. "daily", "weekdays at 9am".' } },
      required: ['description'],
    },
  },
  {
    name: 'list_companion_routines',
    description: 'Read-only list of routines remembered for the currently active companion. Never gated.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_companion_memory_summary',
    description: 'Read-only "what do you remember about me" — real goals/routines/linked-entity counts for the currently active companion, never fabricated. Never gated.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'reset_companion_memory',
    description: 'Permanently erases every goal and routine remembered for the currently active companion. Irreversible — always confirm with the user before setting confirmed: true.',
    parameters: {
      type: 'object',
      properties: { confirmed: { type: 'boolean', description: CONFIRMED_PARAM_DESCRIPTION } },
      required: [],
    },
  },
];

/** Converts a validated tool call into the corresponding ActionRequest, or null if malformed/unknown. */
export function toolCallToActionRequest(toolCall: ReasoningToolCall): ActionRequest | null {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;

  switch (toolCall.name) {
    case 'open_url':
      return typeof args.url === 'string' ? { type: 'openUrl', url: args.url } : null;

    case 'open_app': {
      const knownAppIds: KnownAppId[] = ['vscode', 'chrome', 'explorer', 'notepad', 'terminal'];
      if (typeof args.appId !== 'string' || !(knownAppIds as string[]).includes(args.appId)) return null;
      return {
        type: 'openApp',
        appId: args.appId as KnownAppId,
        path: typeof args.path === 'string' ? args.path : undefined,
      };
    }

    case 'open_folder':
      return typeof args.path === 'string' ? { type: 'openFolder', path: args.path } : null;

    case 'open_file':
      return typeof args.path === 'string' ? { type: 'openFile', path: args.path } : null;

    case 'read_clipboard':
      return { type: 'readClipboard' };

    case 'create_folder':
      return typeof args.path === 'string'
        ? { type: 'createFolder', path: args.path, confirmed: args.confirmed === true }
        : null;

    case 'search_files':
      return typeof args.rootPath === 'string' && typeof args.query === 'string'
        ? {
            type: 'searchFiles',
            rootPath: args.rootPath,
            query: args.query,
            contentQuery: typeof args.contentQuery === 'string' ? args.contentQuery : undefined,
            extensions: Array.isArray(args.extensions) ? (args.extensions as string[]) : undefined,
            modifiedAfter: typeof args.modifiedAfter === 'number' ? args.modifiedAfter : undefined,
            modifiedBefore: typeof args.modifiedBefore === 'number' ? args.modifiedBefore : undefined,
            minSizeBytes: typeof args.minSizeBytes === 'number' ? args.minSizeBytes : undefined,
            maxSizeBytes: typeof args.maxSizeBytes === 'number' ? args.maxSizeBytes : undefined,
            fuzzy: args.fuzzy === true,
            maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
          }
        : null;

    case 'write_file':
      return typeof args.path === 'string' && typeof args.content === 'string'
        ? { type: 'writeFile', path: args.path, content: args.content, confirmed: args.confirmed === true }
        : null;

    case 'run_command': {
      if (typeof args.command !== 'string' || typeof args.cwd !== 'string') return null;
      const validShells = ['cmd', 'powershell', 'gitbash'];
      const shell = typeof args.shell === 'string' && validShells.includes(args.shell) ? (args.shell as never) : undefined;
      return { type: 'runCommand', command: args.command, cwd: args.cwd, shell, confirmed: args.confirmed === true };
    }

    case 'start_process': {
      if (typeof args.command !== 'string' || typeof args.cwd !== 'string') return null;
      const validShells = ['cmd', 'powershell', 'gitbash'];
      const shell = typeof args.shell === 'string' && validShells.includes(args.shell) ? (args.shell as never) : undefined;
      return { type: 'startProcess', command: args.command, cwd: args.cwd, label: typeof args.label === 'string' ? args.label : undefined, shell };
    }

    case 'stop_process':
      return typeof args.processId === 'string' ? { type: 'stopProcess', processId: args.processId } : null;

    case 'restart_process':
      return typeof args.processId === 'string' ? { type: 'restartProcess', processId: args.processId } : null;

    case 'list_processes':
      return { type: 'listProcesses' };

    case 'get_process_output':
      return typeof args.processId === 'string'
        ? { type: 'getProcessOutput', processId: args.processId, maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined }
        : null;

    case 'analyze_project':
      return typeof args.rootPath === 'string' ? { type: 'analyzeProject', rootPath: args.rootPath } : null;

    case 'analyze_project_structure':
      return typeof args.rootPath === 'string' ? { type: 'analyzeProjectStructure', rootPath: args.rootPath } : null;

    case 'analyze_file_impact':
      return typeof args.rootPath === 'string' && typeof args.filePath === 'string'
        ? { type: 'analyzeFileImpact', rootPath: args.rootPath, filePath: args.filePath }
        : null;

    case 'list_workspaces':
      return { type: 'listWorkspaces' };

    case 'get_workspace':
      return typeof args.rootPath === 'string' ? { type: 'getWorkspace', rootPath: args.rootPath } : null;

    case 'check_process_health':
      return typeof args.processId === 'string'
        ? {
            type: 'checkProcessHealth',
            processId: args.processId,
            url: typeof args.url === 'string' ? args.url : undefined,
            logPattern: typeof args.logPattern === 'string' ? args.logPattern : undefined,
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          }
        : null;

    case 'read_file': {
      const validFormats = ['auto', 'text', 'pdf', 'docx', 'xlsx', 'csv', 'json', 'xml', 'image-metadata'];
      const format = typeof args.format === 'string' && validFormats.includes(args.format) ? (args.format as never) : undefined;
      return typeof args.path === 'string'
        ? { type: 'readFile', path: args.path, maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined, format }
        : null;
    }

    case 'list_directory':
      return typeof args.path === 'string' ? { type: 'listDirectory', path: args.path } : null;

    case 'move_path':
      return typeof args.from === 'string' && typeof args.to === 'string'
        ? { type: 'movePath', from: args.from, to: args.to, confirmed: args.confirmed === true }
        : null;

    case 'delete_path':
      return typeof args.path === 'string'
        ? { type: 'deletePath', path: args.path, confirmed: args.confirmed === true, permanent: args.permanent === true }
        : null;

    case 'copy_path':
      return typeof args.from === 'string' && typeof args.to === 'string'
        ? { type: 'copyPath', from: args.from, to: args.to, confirmed: args.confirmed === true }
        : null;

    case 'duplicate_path':
      return typeof args.path === 'string' ? { type: 'duplicatePath', path: args.path } : null;

    case 'compress_path':
      return Array.isArray(args.paths) && typeof args.to === 'string'
        ? { type: 'compressPath', paths: args.paths as string[], to: args.to, confirmed: args.confirmed === true }
        : null;

    case 'extract_archive':
      return typeof args.path === 'string' && typeof args.to === 'string'
        ? { type: 'extractArchive', path: args.path, to: args.to, confirmed: args.confirmed === true }
        : null;

    case 'merge_folders':
      return typeof args.from === 'string' && typeof args.to === 'string' && typeof args.onConflict === 'string'
        ? {
            type: 'mergeFolders',
            from: args.from,
            to: args.to,
            onConflict: args.onConflict as 'skip' | 'overwrite' | 'rename',
            confirmed: args.confirmed === true,
          }
        : null;

    case 'split_file':
      return typeof args.path === 'string' && typeof args.to === 'string' && typeof args.chunkSizeBytes === 'number'
        ? { type: 'splitFile', path: args.path, to: args.to, chunkSizeBytes: args.chunkSizeBytes, confirmed: args.confirmed === true }
        : null;

    case 'restore_path':
      return typeof args.path === 'string' ? { type: 'restorePath', path: args.path } : null;

    case 'index_workspace':
      return typeof args.rootPath === 'string'
        ? { type: 'indexWorkspace', rootPath: args.rootPath, workspaceName: typeof args.workspaceName === 'string' ? args.workspaceName : undefined }
        : null;

    case 'find_file_semantic':
      return typeof args.rootPath === 'string' && typeof args.question === 'string'
        ? {
            type: 'findFileSemantic',
            rootPath: args.rootPath,
            question: args.question,
            docType: typeof args.docType === 'string' ? args.docType : undefined,
            client: typeof args.client === 'string' ? args.client : undefined,
          }
        : null;

    case 'get_workspace_bundle':
      return typeof args.workspaceRef === 'string' ? { type: 'getWorkspaceBundle', workspaceRef: args.workspaceRef } : null;

    case 'query_provenance': {
      const validQuestions = ['lastWorkedOn', 'createdFrom', 'relatedTo', 'belongsTo'];
      return typeof args.entityRef === 'string' && typeof args.question === 'string' && validQuestions.includes(args.question)
        ? { type: 'queryProvenance', entityRef: args.entityRef, question: args.question as never }
        : null;
    }

    case 'explain_classification':
      return typeof args.entityRef === 'string' ? { type: 'explainClassification', entityRef: args.entityRef } : null;

    case 'explain_relationship':
      return typeof args.fromRef === 'string' && typeof args.toRef === 'string'
        ? { type: 'explainRelationship', fromRef: args.fromRef, toRef: args.toRef }
        : null;

    case 'find_duplicate_files':
      return typeof args.rootPath === 'string' ? { type: 'findDuplicateFiles', rootPath: args.rootPath } : null;

    case 'analyze_folder': {
      const validPurposes = ['downloads-cleanup', 'archive-suggestion', 'temp-files', 'sort-by-project', 'sort-by-date', 'sort-by-type'];
      return typeof args.path === 'string' && typeof args.purpose === 'string' && validPurposes.includes(args.purpose)
        ? { type: 'analyzeFolder', path: args.path, purpose: args.purpose as never }
        : null;
    }

    case 'get_special_folders':
      return { type: 'getSpecialFolders' };

    case 'git_status':
      return typeof args.cwd === 'string' ? { type: 'gitStatus', cwd: args.cwd } : null;

    case 'git_diff':
      return typeof args.cwd === 'string' ? { type: 'gitDiff', cwd: args.cwd, staged: args.staged === true } : null;

    case 'git_diff_stat':
      return typeof args.cwd === 'string' ? { type: 'gitDiffStat', cwd: args.cwd, staged: args.staged === true } : null;

    case 'git_log':
      return typeof args.cwd === 'string'
        ? { type: 'gitLog', cwd: args.cwd, maxCount: typeof args.maxCount === 'number' ? args.maxCount : undefined }
        : null;

    case 'git_branch':
      return typeof args.cwd === 'string' ? { type: 'gitBranch', cwd: args.cwd } : null;

    case 'git_show':
      return typeof args.cwd === 'string' && typeof args.ref === 'string' ? { type: 'gitShow', cwd: args.cwd, ref: args.ref } : null;

    case 'git_add': {
      if (typeof args.cwd !== 'string') return null;
      const paths = Array.isArray(args.paths) ? args.paths.filter((p): p is string => typeof p === 'string') : undefined;
      return { type: 'gitAdd', cwd: args.cwd, paths: paths && paths.length > 0 ? paths : undefined };
    }

    case 'git_commit':
      return typeof args.cwd === 'string' && typeof args.message === 'string'
        ? { type: 'gitCommit', cwd: args.cwd, message: args.message, confirmed: args.confirmed === true }
        : null;

    case 'git_create_branch':
      return typeof args.cwd === 'string' && typeof args.branchName === 'string'
        ? { type: 'gitCreateBranch', cwd: args.cwd, branchName: args.branchName, confirmed: args.confirmed === true }
        : null;

    case 'git_checkout':
      return typeof args.cwd === 'string' && typeof args.ref === 'string'
        ? { type: 'gitCheckout', cwd: args.cwd, ref: args.ref, confirmed: args.confirmed === true }
        : null;

    case 'install_tool': {
      const knownManagers = ['winget', 'npm', 'pip', 'code-extension'];
      if (typeof args.manager !== 'string' || !knownManagers.includes(args.manager) || typeof args.packageId !== 'string') return null;
      return {
        type: 'installTool',
        manager: args.manager as 'winget' | 'npm' | 'pip' | 'code-extension',
        packageId: args.packageId,
        verifyCommand: typeof args.verifyCommand === 'string' ? args.verifyCommand : undefined,
        executableHint: typeof args.executableHint === 'string' ? args.executableHint : undefined,
        launchCommand: typeof args.launchCommand === 'string' ? args.launchCommand : undefined,
        expectedProcessName: typeof args.expectedProcessName === 'string' ? args.expectedProcessName : undefined,
        confirmed: args.confirmed === true,
      };
    }

    case 'detect_software': {
      const knownManagers = ['winget', 'npm', 'pip', 'code-extension'];
      if (typeof args.manager !== 'string' || !knownManagers.includes(args.manager) || typeof args.packageId !== 'string') return null;
      return { type: 'detectSoftware', manager: args.manager as 'winget' | 'npm' | 'pip' | 'code-extension', packageId: args.packageId };
    }

    case 'update_software': {
      const knownManagers = ['winget', 'npm', 'pip', 'code-extension'];
      if (typeof args.manager !== 'string' || !knownManagers.includes(args.manager) || typeof args.packageId !== 'string') return null;
      return {
        type: 'updateSoftware',
        manager: args.manager as 'winget' | 'npm' | 'pip' | 'code-extension',
        packageId: args.packageId,
        confirmed: args.confirmed === true,
      };
    }

    case 'uninstall_software': {
      const knownManagers = ['winget', 'npm', 'pip', 'code-extension'];
      if (typeof args.manager !== 'string' || !knownManagers.includes(args.manager) || typeof args.packageId !== 'string') return null;
      return {
        type: 'uninstallSoftware',
        manager: args.manager as 'winget' | 'npm' | 'pip' | 'code-extension',
        packageId: args.packageId,
        confirmed: args.confirmed === true,
      };
    }

    case 'repair_software': {
      const knownManagers = ['winget', 'npm', 'pip', 'code-extension'];
      if (typeof args.manager !== 'string' || !knownManagers.includes(args.manager) || typeof args.packageId !== 'string') return null;
      return {
        type: 'repairSoftware',
        manager: args.manager as 'winget' | 'npm' | 'pip' | 'code-extension',
        packageId: args.packageId,
        verifyCommand: typeof args.verifyCommand === 'string' ? args.verifyCommand : undefined,
        executableHint: typeof args.executableHint === 'string' ? args.executableHint : undefined,
        confirmed: args.confirmed === true,
      };
    }

    case 'verify_tool_installed':
      return typeof args.command === 'string' ? { type: 'verifyToolInstalled', command: args.command } : null;

    case 'set_path_entry':
      return typeof args.entry === 'string'
        ? {
            type: 'setPathEntry',
            entry: args.entry,
            preferredScope: args.preferredScope === 'machine' || args.preferredScope === 'user' ? args.preferredScope : undefined,
            confirmed: args.confirmed === true,
          }
        : null;

    case 'set_environment_variable':
      return typeof args.name === 'string' && typeof args.value === 'string'
        ? {
            type: 'setEnvironmentVariable',
            name: args.name,
            value: args.value,
            preferredScope: args.preferredScope === 'machine' || args.preferredScope === 'user' ? args.preferredScope : undefined,
            confirmed: args.confirmed === true,
          }
        : null;

    case 'open_dev_browser':
      return typeof args.sessionId === 'string' && typeof args.url === 'string'
        ? { type: 'openDevBrowser', sessionId: args.sessionId, url: args.url }
        : null;

    case 'refresh_dev_browser':
      return typeof args.sessionId === 'string' ? { type: 'refreshDevBrowser', sessionId: args.sessionId } : null;

    case 'read_browser_console':
      return typeof args.sessionId === 'string'
        ? { type: 'readBrowserConsole', sessionId: args.sessionId, maxEntries: typeof args.maxEntries === 'number' ? args.maxEntries : undefined }
        : null;

    case 'read_browser_network_errors':
      return typeof args.sessionId === 'string' ? { type: 'readBrowserNetworkErrors', sessionId: args.sessionId } : null;

    case 'capture_browser_screenshot':
      return typeof args.sessionId === 'string' ? { type: 'captureBrowserScreenshot', sessionId: args.sessionId } : null;

    case 'dev_browser_preview':
      return typeof args.sessionId === 'string' ? { type: 'devBrowserPreview', sessionId: args.sessionId } : null;

    case 'fill_dev_form': {
      if (typeof args.sessionId !== 'string' || !Array.isArray(args.fields)) return null;
      const fields = args.fields.filter(
        (f): f is { selector: string; value: string } =>
          typeof f === 'object' && f !== null && typeof (f as any).selector === 'string' && typeof (f as any).value === 'string'
      );
      return {
        type: 'fillDevForm',
        sessionId: args.sessionId,
        fields,
        submitSelector: typeof args.submitSelector === 'string' ? args.submitSelector : undefined,
        confirmed: args.confirmed === true,
      };
    }

    case 'download_project_file':
      return typeof args.sessionId === 'string' && typeof args.url === 'string' && typeof args.savePath === 'string'
        ? { type: 'downloadProjectFile', sessionId: args.sessionId, url: args.url, savePath: args.savePath }
        : null;

    case 'upload_project_file':
      return typeof args.sessionId === 'string' && typeof args.selector === 'string' && typeof args.filePath === 'string'
        ? { type: 'uploadProjectFile', sessionId: args.sessionId, selector: args.selector, filePath: args.filePath }
        : null;

    case 'browse_web': {
      const validBrowsers = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
      const browser = typeof args.browser === 'string' && validBrowsers.includes(args.browser) ? (args.browser as never) : undefined;
      return typeof args.sessionId === 'string' && typeof args.url === 'string'
        ? { type: 'browseWeb', sessionId: args.sessionId, url: args.url, browser, confirmed: args.confirmed === true }
        : null;
    }

    case 'search_web': {
      const validBrowsers = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
      const browser = typeof args.browser === 'string' && validBrowsers.includes(args.browser) ? (args.browser as never) : undefined;
      return typeof args.sessionId === 'string' && typeof args.query === 'string'
        ? { type: 'searchWeb', sessionId: args.sessionId, query: args.query, browser }
        : null;
    }

    case 'list_available_browsers':
      return { type: 'listAvailableBrowsers' };

    case 'set_preferred_browser_order': {
      const validBrowsers = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
      const order = Array.isArray(args.order) ? args.order.filter((id): id is string => typeof id === 'string' && validBrowsers.includes(id)) : [];
      return order.length > 0 ? { type: 'setPreferredBrowserOrder', order: order as never } : null;
    }

    case 'get_browser_history':
      return {
        type: 'getBrowserHistory',
        since: typeof args.since === 'number' ? args.since : undefined,
        until: typeof args.until === 'number' ? args.until : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      };

    case 'bookmark_page':
      return {
        type: 'bookmarkPage',
        sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
        url: typeof args.url === 'string' ? args.url : undefined,
        label: typeof args.label === 'string' ? args.label : undefined,
      };

    case 'list_bookmarks':
      return { type: 'listBookmarks' };

    case 'record_page_summary':
      return typeof args.summary === 'string' && args.summary.trim()
        ? {
            type: 'recordPageSummary',
            sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
            url: typeof args.url === 'string' ? args.url : undefined,
            summary: args.summary,
          }
        : null;

    case 'search_browser_memory':
      return typeof args.query === 'string' && args.query.trim() ? { type: 'searchBrowserMemory', query: args.query } : null;

    case 'run_comparison_workflow': {
      const validBrowsers = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
      if (typeof args.topic !== 'string' || !args.topic.trim() || !Array.isArray(args.candidates)) return null;
      const candidates = args.candidates.filter(
        (c): c is { name: string; url: string } => Boolean(c) && typeof c.name === 'string' && typeof c.url === 'string'
      );
      if (candidates.length === 0) return null;
      const selectors = Array.isArray(args.selectors) ? args.selectors.filter((s): s is string => typeof s === 'string') : undefined;
      const browser = typeof args.browser === 'string' && validBrowsers.includes(args.browser) ? (args.browser as never) : undefined;
      return {
        type: 'runComparisonWorkflow',
        topic: args.topic,
        candidates,
        selectors: selectors && selectors.length > 0 ? selectors : undefined,
        browser,
        confirmed: args.confirmed === true,
      };
    }

    case 'record_comparison': {
      if (typeof args.topic !== 'string' || !Array.isArray(args.candidates) || !Array.isArray(args.ranking) || typeof args.recommendation !== 'string') return null;
      const candidates = args.candidates.filter(
        (c): c is { name: string; url: string; values: Record<string, string | number> } =>
          Boolean(c) && typeof c.name === 'string' && typeof c.url === 'string' && typeof c.values === 'object' && c.values !== null
      );
      if (candidates.length === 0) return null;
      const ranking = args.ranking.filter((r): r is string => typeof r === 'string');
      return { type: 'recordComparison', topic: args.topic, candidates, ranking, recommendation: args.recommendation };
    }

    case 'get_comparison':
      return typeof args.topic === 'string' && args.topic.trim() ? { type: 'getComparison', topic: args.topic } : null;

    case 'checkpoint_research': {
      const validStatuses = ['in_progress', 'paused', 'completed'];
      if (typeof args.topic !== 'string' || typeof args.status !== 'string' || !validStatuses.includes(args.status)) return null;
      return {
        type: 'checkpointResearch',
        topic: args.topic,
        status: args.status as never,
        finding: typeof args.finding === 'string' ? args.finding : undefined,
        nextSteps: typeof args.nextSteps === 'string' ? args.nextSteps : undefined,
        finalReport: typeof args.finalReport === 'string' ? args.finalReport : undefined,
      };
    }

    case 'get_research_status':
      return typeof args.topic === 'string' && args.topic.trim() ? { type: 'getResearchStatus', topic: args.topic } : null;

    case 'get_browser_cookies':
      return typeof args.sessionId === 'string' ? { type: 'getBrowserCookies', sessionId: args.sessionId, confirmed: args.confirmed === true } : null;

    case 'reuse_existing_browser_session': {
      const validBrowsers = ['chrome', 'edge', 'brave'];
      return typeof args.sessionId === 'string' && typeof args.url === 'string' && typeof args.browser === 'string' && validBrowsers.includes(args.browser)
        ? { type: 'reuseExistingBrowserSession', sessionId: args.sessionId, url: args.url, browser: args.browser as never, confirmed: args.confirmed === true }
        : null;
    }

    case 'print_browser_page_to_pdf':
      return typeof args.sessionId === 'string' && typeof args.savePath === 'string'
        ? { type: 'printBrowserPageToPdf', sessionId: args.sessionId, savePath: args.savePath, confirmed: args.confirmed === true }
        : null;

    case 'read_web_page':
      return typeof args.sessionId === 'string'
        ? { type: 'readWebPage', sessionId: args.sessionId, maxChars: typeof args.maxChars === 'number' ? args.maxChars : undefined }
        : null;

    case 'extract_page_data':
      return typeof args.sessionId === 'string'
        ? {
            type: 'extractPageData',
            sessionId: args.sessionId,
            selectors: Array.isArray(args.selectors) ? args.selectors.filter((s): s is string => typeof s === 'string') : undefined,
          }
        : null;

    case 'click_element':
      return typeof args.sessionId === 'string' && typeof args.selector === 'string'
        ? { type: 'clickElement', sessionId: args.sessionId, selector: args.selector }
        : null;

    case 'scroll_browser_page':
      return typeof args.sessionId === 'string'
        ? {
            type: 'scrollBrowserPage',
            sessionId: args.sessionId,
            selector: typeof args.selector === 'string' ? args.selector : undefined,
            direction: args.direction === 'up' || args.direction === 'down' ? args.direction : undefined,
            amount: typeof args.amount === 'number' ? args.amount : undefined,
          }
        : null;

    case 'wait_for_browser_state':
      return typeof args.sessionId === 'string'
        ? {
            type: 'waitForBrowserState',
            sessionId: args.sessionId,
            selector: typeof args.selector === 'string' ? args.selector : undefined,
            urlContains: typeof args.urlContains === 'string' ? args.urlContains : undefined,
            timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          }
        : null;

    case 'fill_browser_form': {
      if (typeof args.sessionId !== 'string' || !Array.isArray(args.fields)) return null;
      const fields = args.fields.filter(
        (f): f is { selector: string; value: string } =>
          typeof f === 'object' && f !== null && typeof (f as any).selector === 'string' && typeof (f as any).value === 'string'
      );
      return {
        type: 'fillBrowserForm',
        sessionId: args.sessionId,
        fields,
        submitSelector: typeof args.submitSelector === 'string' ? args.submitSelector : undefined,
        confirmed: args.confirmed === true,
      };
    }

    case 'upload_browser_file':
      return typeof args.sessionId === 'string' && typeof args.selector === 'string' && typeof args.filePath === 'string'
        ? { type: 'uploadBrowserFile', sessionId: args.sessionId, selector: args.selector, filePath: args.filePath }
        : null;

    case 'download_browser_file':
      return typeof args.sessionId === 'string' && typeof args.savePath === 'string'
        ? {
            type: 'downloadBrowserFile',
            sessionId: args.sessionId,
            savePath: args.savePath,
            selector: typeof args.selector === 'string' ? args.selector : undefined,
            url: typeof args.url === 'string' ? args.url : undefined,
          }
        : null;

    case 'list_browser_tabs':
      return { type: 'listBrowserTabs' };

    case 'close_browser_tab':
      return typeof args.sessionId === 'string' ? { type: 'closeBrowserTab', sessionId: args.sessionId } : null;

    case 'build_project':
      return typeof args.cwd === 'string' && typeof args.buildCommand === 'string'
        ? { type: 'buildProject', cwd: args.cwd, buildCommand: args.buildCommand, timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined }
        : null;

    case 'read_env_vars':
      return typeof args.path === 'string' ? { type: 'readEnvVars', path: args.path } : null;

    case 'write_env_var':
      return typeof args.path === 'string' && typeof args.key === 'string' && typeof args.value === 'string'
        ? { type: 'writeEnvVar', path: args.path, key: args.key, value: args.value, confirmed: args.confirmed === true }
        : null;

    case 'run_deploy_script':
      return typeof args.cwd === 'string' && typeof args.command === 'string'
        ? { type: 'runDeployScript', cwd: args.cwd, command: args.command, confirmed: args.confirmed === true }
        : null;

    case 'verify_deployment':
      return typeof args.url === 'string'
        ? { type: 'verifyDeployment', url: args.url, timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined }
        : null;

    case 'record_error_fix':
      if (typeof args.workspaceRoot !== 'string' || typeof args.problem !== 'string' || typeof args.cause !== 'string' || typeof args.solution !== 'string') {
        return null;
      }
      return {
        type: 'recordErrorFix',
        workspaceRoot: args.workspaceRoot,
        problem: args.problem,
        cause: args.cause,
        solution: args.solution,
        filesChanged: Array.isArray(args.filesChanged) ? args.filesChanged.filter((f): f is string => typeof f === 'string') : undefined,
        commandsUsed: Array.isArray(args.commandsUsed) ? args.commandsUsed.filter((c): c is string => typeof c === 'string') : undefined,
        verification: typeof args.verification === 'string' ? args.verification : undefined,
      };

    case 'find_similar_errors':
      return typeof args.problem === 'string'
        ? { type: 'findSimilarErrors', problem: args.problem, workspaceRoot: typeof args.workspaceRoot === 'string' ? args.workspaceRoot : undefined }
        : null;

    case 'analyze_reference_image':
      // imageDataUrls/apiKey are never model-supplied — ConversationRuntime
      // resolves and injects both right before execution (see handleToolCall).
      return { type: 'analyzeReferenceImage', imageIndex: typeof args.imageIndex === 'number' ? args.imageIndex : undefined };

    case 'extract_page_structure':
      return typeof args.sessionId === 'string'
        ? {
            type: 'extractPageStructure',
            sessionId: args.sessionId,
            selectors: Array.isArray(args.selectors) ? args.selectors.filter((s): s is string => typeof s === 'string') : undefined,
          }
        : null;

    case 'optimize_image':
      return typeof args.path === 'string'
        ? {
            type: 'optimizeImage',
            path: args.path,
            outputPath: typeof args.outputPath === 'string' ? args.outputPath : undefined,
            format: args.format === 'jpeg' || args.format === 'webp' ? args.format : undefined,
            quality: typeof args.quality === 'number' ? args.quality : undefined,
          }
        : null;

    case 'generate_thumbnail':
      return typeof args.path === 'string'
        ? {
            type: 'generateThumbnail',
            path: args.path,
            outputPath: typeof args.outputPath === 'string' ? args.outputPath : undefined,
            width: typeof args.width === 'number' ? args.width : undefined,
            height: typeof args.height === 'number' ? args.height : undefined,
          }
        : null;

    case 'generate_responsive_variants':
      return typeof args.path === 'string'
        ? {
            type: 'generateResponsiveVariants',
            path: args.path,
            outputDir: typeof args.outputDir === 'string' ? args.outputDir : undefined,
            widths: Array.isArray(args.widths) ? args.widths.filter((w): w is number => typeof w === 'number') : undefined,
          }
        : null;

    case 'generate_alt_text':
      // apiKey is never model-supplied — ConversationRuntime injects it
      // right before execution (see handleToolCall).
      return typeof args.path === 'string' ? { type: 'generateAltText', path: args.path } : null;

    case 'organize_asset':
      return typeof args.path === 'string' && typeof args.projectRoot === 'string'
        ? { type: 'organizeAsset', path: args.path, projectRoot: args.projectRoot }
        : null;

    case 'verify_rendered_ui':
      // apiKey is never model-supplied — ConversationRuntime injects it
      // right before execution (see handleToolCall).
      return typeof args.sessionId === 'string' ? { type: 'verifyRenderedUi', sessionId: args.sessionId } : null;

    case 'start_communication_capture':
      return typeof args.medium === 'string'
        ? {
            type: 'startCommunicationCapture',
            medium: args.medium,
            title: typeof args.title === 'string' ? args.title : undefined,
            consentConfirmed: typeof args.consentConfirmed === 'boolean' ? args.consentConfirmed : undefined,
          }
        : null;

    case 'stop_communication_capture':
      return typeof args.communicationId === 'string' ? { type: 'stopCommunicationCapture', communicationId: args.communicationId } : null;

    case 'pause_communication_capture':
      return typeof args.communicationId === 'string' ? { type: 'pauseCommunicationCapture', communicationId: args.communicationId } : null;

    case 'resume_communication_capture':
      return typeof args.communicationId === 'string' ? { type: 'resumeCommunicationCapture', communicationId: args.communicationId } : null;

    case 'process_communication':
      // apiKey is never model-supplied — ConversationRuntime injects it
      // right before execution (see handleToolCall).
      return typeof args.communicationId === 'string' ? { type: 'processCommunication', communicationId: args.communicationId } : null;

    case 'get_communication':
      return typeof args.communicationId === 'string' ? { type: 'getCommunication', communicationId: args.communicationId } : null;

    case 'get_communication_timeline': {
      const scope: Record<string, unknown> = {};
      if (typeof args.participantId === 'string') scope.participantId = args.participantId;
      if (typeof args.companyId === 'string') scope.companyId = args.companyId;
      if (typeof args.projectId === 'string') scope.projectId = args.projectId;
      if (typeof args.medium === 'string') scope.medium = args.medium;
      if (typeof args.dateFrom === 'number' && typeof args.dateTo === 'number') scope.dateRange = { from: args.dateFrom, to: args.dateTo };
      return { type: 'getCommunicationTimeline', scope: Object.keys(scope).length > 0 ? (scope as any) : undefined };
    }

    case 'get_company_workspace':
      return { type: 'getCompanyWorkspace', companyId: typeof args.companyId === 'string' ? args.companyId : undefined, companyName: typeof args.companyName === 'string' ? args.companyName : undefined };

    case 'get_contact_history':
      return { type: 'getContactHistory', participantId: typeof args.participantId === 'string' ? args.participantId : undefined, participantName: typeof args.participantName === 'string' ? args.participantName : undefined };

    case 'search_communications': {
      const filters: Record<string, unknown> = {};
      if (typeof args.participantId === 'string') filters.participantId = args.participantId;
      if (typeof args.companyId === 'string') filters.companyId = args.companyId;
      if (typeof args.projectId === 'string') filters.projectId = args.projectId;
      if (typeof args.medium === 'string') filters.medium = args.medium;
      // apiKey is never model-supplied — ConversationRuntime injects it
      // right before execution (see handleToolCall).
      return {
        type: 'searchCommunications',
        query: { text: typeof args.text === 'string' ? args.text : undefined, filters: Object.keys(filters).length > 0 ? (filters as any) : undefined },
      };
    }

    case 'add_communication_note':
      return typeof args.communicationId === 'string' && typeof args.note === 'string'
        ? { type: 'addCommunicationNote', communicationId: args.communicationId, note: args.note }
        : null;

    case 'confirm_communication_action_items':
      return typeof args.communicationId === 'string' && Array.isArray(args.actionItemIds)
        ? { type: 'confirmCommunicationActionItems', communicationId: args.communicationId, actionItemIds: args.actionItemIds.filter((i): i is string => typeof i === 'string') }
        : null;

    case 'begin_mobile_pairing':
      return { type: 'beginMobilePairing' };

    case 'list_paired_devices':
      return { type: 'listPairedDevices' };

    case 'unpair_device':
      return typeof args.deviceId === 'string' ? { type: 'unpairDevice', deviceId: args.deviceId } : null;

    case 'get_email_preferences':
      return { type: 'getEmailPreferences' };

    case 'set_email_preferences': {
      const validProviders = ['gmail', 'outlook', 'microsoft365', 'googleWorkspace', 'default'];
      return typeof args.displayName === 'string' &&
        typeof args.emailAddress === 'string' &&
        typeof args.provider === 'string' &&
        validProviders.includes(args.provider)
        ? {
            type: 'setEmailPreferences',
            displayName: args.displayName,
            emailAddress: args.emailAddress,
            provider: args.provider as 'gmail' | 'outlook' | 'microsoft365' | 'googleWorkspace' | 'default',
          }
        : null;
    }

    case 'get_coding_mode':
      return { type: 'getCodingMode' };

    case 'set_coding_mode':
      return args.mode === 'go' || args.mode === 'pro' ? { type: 'setCodingMode', mode: args.mode } : null;

    case 'set_task_checklist': {
      if (!Array.isArray(args.items)) return null;
      const items = args.items.filter(
        (i): i is { id: string; label: string; status: 'pending' | 'inProgress' | 'done' | 'skipped' } =>
          Boolean(i) &&
          typeof i === 'object' &&
          typeof (i as Record<string, unknown>).id === 'string' &&
          typeof (i as Record<string, unknown>).label === 'string' &&
          ['pending', 'inProgress', 'done', 'skipped'].includes((i as Record<string, unknown>).status as string)
      );
      return items.length > 0 ? { type: 'setTaskChecklist', items } : null;
    }

    case 'draft_followup_email':
      return typeof args.communicationId === 'string' ? { type: 'draftFollowupEmail', communicationId: args.communicationId } : null;

    case 'list_email_drafts':
      return { type: 'listEmailDrafts' };

    case 'open_mail_compose_window':
      return typeof args.recipient === 'string' && typeof args.subject === 'string' && typeof args.body === 'string'
        ? { type: 'openMailComposeWindow', recipient: args.recipient, subject: args.subject, body: args.body }
        : null;

    case 'confirm_email_sent':
      return typeof args.communicationId === 'string' && typeof args.draftId === 'string' && Array.isArray(args.recipients)
        ? { type: 'confirmEmailSent', communicationId: args.communicationId, draftId: args.draftId, recipients: args.recipients.map(String) }
        : null;

    case 'deploy_project':
      return typeof args.cwd === 'string'
        ? {
            type: 'deployProject',
            cwd: args.cwd,
            environment: args.environment === 'staging' || args.environment === 'preview' ? args.environment : 'production',
            confirmed: args.confirmed === true,
          }
        : null;

    case 'rollback_deployment':
      return typeof args.serviceName === 'string' ? { type: 'rollbackDeployment', serviceName: args.serviceName, confirmed: args.confirmed === true } : null;

    case 'promote_deployment':
      return typeof args.serviceName === 'string' ? { type: 'promoteDeployment', serviceName: args.serviceName, confirmed: args.confirmed === true } : null;

    case 'get_deployment_status':
      return typeof args.serviceName === 'string'
        ? { type: 'getDeploymentStatus', serviceName: args.serviceName, repo: typeof args.repo === 'string' ? args.repo : undefined, branch: typeof args.branch === 'string' ? args.branch : undefined }
        : null;

    case 'list_configured_infra_connectors':
      return { type: 'listConfiguredInfraConnectors' };

    case 'get_approval_queue':
      return { type: 'getApprovalQueue' };

    case 'list_engineering_memory':
      return { type: 'listEngineeringMemory' };

    case 'get_infrastructure_graph_summary':
      return typeof args.serviceName === 'string' ? { type: 'getInfrastructureGraphSummary', serviceName: args.serviceName } : null;

    case 'investigate_ticket':
      return typeof args.ticketId === 'string' ? { type: 'investigateTicket', ticketId: args.ticketId, cwd: typeof args.cwd === 'string' ? args.cwd : undefined } : null;

    case 'investigate_production_issue':
      return typeof args.description === 'string' && typeof args.cwd === 'string' ? { type: 'investigateProductionIssue', description: args.description, cwd: args.cwd } : null;

    case 'compare_deployments':
      return typeof args.serviceName === 'string' ? { type: 'compareDeployments', serviceName: args.serviceName } : null;

    case 'discover_infrastructure':
      return { type: 'discoverInfrastructure' };

    case 'search_infrastructure':
      return typeof args.query === 'string' ? { type: 'searchInfrastructure', query: args.query } : null;

    case 'get_infra_mode':
      return { type: 'getInfraMode' };

    case 'set_infra_mode':
      return args.mode === 'investigate' || args.mode === 'full' ? { type: 'setInfraMode', mode: args.mode } : null;

    case 'merge_pdfs':
      return Array.isArray(args.inputPaths) && typeof args.outputPath === 'string'
        ? { type: 'mergePdfs', inputPaths: args.inputPaths.map(String), outputPath: args.outputPath, confirmed: args.confirmed === true }
        : null;

    case 'create_docx':
      return typeof args.outputPath === 'string' && Array.isArray(args.sections)
        ? {
            type: 'createDocx',
            outputPath: args.outputPath,
            title: typeof args.title === 'string' ? args.title : undefined,
            sections: args.sections as { heading?: string; paragraphs: string[] }[],
            confirmed: args.confirmed === true,
          }
        : null;

    case 'create_spreadsheet':
      return typeof args.outputPath === 'string' && Array.isArray(args.sheets)
        ? {
            type: 'createSpreadsheet',
            outputPath: args.outputPath,
            sheets: args.sheets as { name: string; rows: (string | number)[][]; formulas?: { cell: string; formula: string }[] }[],
            confirmed: args.confirmed === true,
          }
        : null;

    case 'analyze_spreadsheet':
      return typeof args.filePath === 'string'
        ? { type: 'analyzeSpreadsheet', filePath: args.filePath, sheetName: typeof args.sheetName === 'string' ? args.sheetName : undefined }
        : null;

    case 'create_presentation':
      return typeof args.outputPath === 'string' && Array.isArray(args.slides)
        ? {
            type: 'createPresentation',
            outputPath: args.outputPath,
            theme: args.theme as { primaryColor?: string; backgroundColor?: string } | undefined,
            slides: args.slides as {
              title?: string;
              bullets?: string[];
              notes?: string;
              chart?: { kind: 'bar' | 'line' | 'pie' | 'doughnut' | 'area'; categories: string[]; series: { name: string; values: number[] }[] };
            }[],
            confirmed: args.confirmed === true,
          }
        : null;

    case 'list_recent_office_files':
      return { type: 'listRecentOfficeFiles' };

    case 'confirm_general_email_sent':
      return typeof args.recipient === 'string' && typeof args.subject === 'string'
        ? { type: 'confirmGeneralEmailSent', recipient: args.recipient, subject: args.subject }
        : null;

    case 'record_companion_goal':
      return typeof args.text === 'string' && companionProfileStore.getActive().memory.enabled
        ? { type: 'recordCompanionGoal', companionId: companionProfileStore.getActive().id, text: args.text }
        : null;

    case 'list_companion_goals':
      return { type: 'listCompanionGoals', companionId: companionProfileStore.getActive().id };

    case 'complete_companion_goal':
      return typeof args.goalId === 'string' ? { type: 'completeCompanionGoal', goalId: args.goalId } : null;

    case 'record_companion_routine':
      return typeof args.description === 'string' && companionProfileStore.getActive().memory.enabled
        ? {
            type: 'recordCompanionRoutine',
            companionId: companionProfileStore.getActive().id,
            description: args.description,
            cadence: typeof args.cadence === 'string' ? args.cadence : undefined,
          }
        : null;

    case 'list_companion_routines':
      return { type: 'listCompanionRoutines', companionId: companionProfileStore.getActive().id };

    case 'get_companion_memory_summary':
      return { type: 'getCompanionMemorySummary', companionId: companionProfileStore.getActive().id };

    case 'reset_companion_memory':
      return { type: 'resetCompanionMemory', companionId: companionProfileStore.getActive().id, confirmed: args.confirmed === true };

    default:
      return null;
  }
}
