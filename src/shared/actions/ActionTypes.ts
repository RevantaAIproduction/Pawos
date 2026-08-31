import type { ExecutionTrail } from './ExecutionLifecycle';
import type { ConnectivityScope } from '../connectivity/ConnectivityTypes';
import type { CapabilityConfirmation, Requirement } from '../runtime/RequirementTypes';
import type { IntelligenceReport } from '../intelligence/IntelligenceReportTypes';
import type { CodingRuntimeSession } from './CodingRuntimeSessionTypes';

/** Kept as a plain string union here (not imported from src/main/execution/browser/) so this shared file never depends on main-process-only code — the real BrowserAdapter/BrowserId types there are the source of truth for values, this is just the wire shape. */
export type BrowserId = 'chrome' | 'edge' | 'brave' | 'firefox' | 'electron';

/** Which shell interprets a runCommand/startProcess command string — see shellCommand.ts for how each is actually invoked. */
export type CommandShell = 'cmd' | 'powershell' | 'gitbash';

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — a simplified, model-friendly unit smaller
 * than a raw unified diff. Each array is a list of exact lines (no embedded newlines). contextBefore/
 * contextAfter anchor the edit's real location in the file (matched verbatim by patchApplier.ts, no
 * fuzzing); oldLines is what's being replaced (empty for a pure insertion); newLines is what replaces
 * it (empty for a pure deletion). At least one of contextBefore/oldLines must be non-empty — otherwise
 * there is nothing to anchor the edit's location to (see ApplyCodeEditPlugin.requirements()). When a
 * file needs multiple hunks, list them in ascending file order — patchApplier.ts locates each one
 * strictly after the previous, so out-of-order or overlapping hunks fail to apply rather than
 * silently landing in the wrong place.
 */
export type CodeEditHunk = {
  contextBefore: string[];
  oldLines: string[];
  newLines: string[];
  contextAfter: string[];
};

/**
 * Desktop actions the companion can perform. Each variant is either:
 *  - implemented: a real, safe operation using Electron's `shell` module,
 *    Node's `child_process`, or `fs` (openUrl/openApp/openFolder/openFile/
 *    createFolder/searchFiles/readClipboard), or
 *  - planned: accepted by the type system so callers can be written against
 *    it now, but the plugin for it honestly reports `not-implemented`
 *    instead of faking OS integration that isn't wired (volume/Bluetooth/
 *    WiFi/window-arrangement/meetings — these need native modules or
 *    OS-specific APIs this project doesn't have yet).
 */
/** `scope` is optional and additive — populated by the renderer from the signed-in session (same
 *  convention already used by every `connectivity:*` IPC call) only when a plugin actually needs
 *  it (via RequirementGate); every existing call site that never sets it is unaffected.
 *  `projectId` is optional — when present, constrains execution to that project (org_projects.id).
 *  `approvalId` is optional — when destructive action requires approval, ties resume flow to this ID. */
export type ActionRequest = { scope?: ConnectivityScope; codingRuntimeSession?: CodingRuntimeSession; projectId?: string; approvalId?: string } & (
  | { type: 'openUrl'; url: string }
  | { type: 'openApp'; appId: KnownAppId; path?: string }
  | { type: 'openFolder'; path: string }
  | { type: 'openFile'; path: string }
  | { type: 'createFolder'; path: string; confirmed?: boolean }
  | { type: 'readClipboard' }
  | { type: 'writeFile'; path: string; content: string; confirmed?: boolean }
  // `shell` picks which shell actually interprets `command` — omitted
  // means today's unchanged behavior (the OS default, cmd.exe on Windows).
  // Only set it when the command genuinely needs that shell's own syntax.
  // No 'wsl' option yet — WSL isn't allowlisted as an executable.
  | { type: 'runCommand'; command: string; cwd: string; shell?: CommandShell; confirmed?: boolean }
  // Background/long-running processes (dev servers, watch builds) — distinct
  // from runCommand, which is buffered and only ever meant for short-lived
  // commands. Only ever operate on processes ProcessManager itself spawned.
  | { type: 'startProcess'; command: string; cwd: string; label?: string; shell?: CommandShell }
  | { type: 'stopProcess'; processId: string }
  | { type: 'restartProcess'; processId: string }
  | { type: 'listProcesses' }
  | { type: 'getProcessOutput'; processId: string; maxChars?: number }
  | { type: 'analyzeProject'; rootPath: string }
  // Coding Intelligence Runtime Phase 2 — "Project Understanding": a shallow
  // file tree + real package.json dependencies + entry-point resolution,
  // upserted as a codingProject Memory Graph entity. Read-only — available
  // in both Paw Go and Paw Pro.
  | { type: 'analyzeProjectStructure'; rootPath: string }
  // "File impact analysis" — best-effort substring search for other project
  // files that reference the given file's basename. Read-only.
  | { type: 'analyzeFileImpact'; rootPath: string; filePath: string }
  // Coding Runtime V2, Context Understanding Engine — a real import graph (via the
  // LanguageProviderRegistry, TypeScript today), not a basename substring search. Forked into a
  // standalone child process (DependencyGraphBuilder), cached incrementally (DependencyGraphCache).
  // Read-only — available in both Paw Go and Paw Pro, same as analyzeProjectStructure.
  | { type: 'buildDependencyGraph'; rootPath: string }
  // Coding Runtime V2, Feature Discovery Engine — deterministic route+component+data-model+
  // config+test clustering (union-find over traced routes/API calls/import edges), upserted as
  // codingFeature Memory Graph entities. Read-only — available in both Paw Go and Paw Pro.
  | { type: 'discoverProjectFeatures'; rootPath: string }
  // Coding Runtime V2, Asset Understanding Engine — deterministic extension/exact-name asset
  // classification (image/stylesheet/config/markdown/buildFile/sourceCode/test/other) plus real
  // image dimension metadata (image-size), no AI call. Read-only — available in both Paw Go and
  // Paw Pro.
  | { type: 'classifyProjectAssets'; rootPath: string }
  // Coding Runtime V2, Domain Intelligence Engine — generic, pluggable domain-vocabulary detection
  // (auth/billing/crudResource built-in packs) against an arbitrary third-party project, each
  // requiring real structural evidence (a dependency, a path convention, a traced route quad), never
  // a vocabulary word alone. Read-only — available in both Paw Go and Paw Pro.
  | { type: 'detectDomainConcepts'; rootPath: string }
  // Coding Runtime V2, Repository Semantic Index — orchestrates the dependency graph, feature
  // discovery, domain concepts, and asset classification (in that dependency order) into one
  // queryable composition. Read-only from the target project's perspective (only writes to PawOS's
  // own index cache) — available in both Paw Go and Paw Pro.
  | { type: 'buildRepositorySemanticIndex'; rootPath: string }
  // Coding Runtime V2, Intelligent File Discovery — given a natural-language feature request,
  // locates every plausibly-affected file via three combined, confidence-tiered signals (feature-map
  // hit, dependency-graph expansion, scoped fuzzy path search). A real improvement over
  // analyzeFileImpact's basename-substring heuristic for this broader "what does this request touch"
  // question — analyzeFileImpact is kept unreplaced for its own narrower job. Read-only — available
  // in both Paw Go and Paw Pro.
  | { type: 'discoverAffectedFiles'; rootPath: string; query: string }
  // Coding Runtime V2, Multi-file Editing Engine (§10) — a real patch-based edit primitive,
  // additive alongside writeFile's whole-file overwrite (kept unchanged for its own create/
  // replace-everything job). Applying a patch inherently requires the target file to already exist
  // (there's nothing to locate contextBefore/oldLines within otherwise), so — mirroring writeFile's
  // own `exists && !confirmed` self-check exactly — confirmation is handled inside the plugin itself
  // rather than a blanket DESTRUCTIVE_ACTION_TYPES entry; unlike writeFile (which has a genuine
  // no-confirmation-needed "brand new file" mode), every real applyCodeEdit call touches existing
  // content, so its self-check is never a no-op the way writeFile's can be.
  // `planId` (added for Coding Runtime Memory, §14) is optional and purely for provenance — when
  // this call executes one step of a `proposeCodeEditPlan` batch, the model echoes back the plan's
  // id (as seen on that step's own actionRequest) so the auto-recorded codingEditHistory entry can
  // tie itself back to the reviewable plan the user approved. Omitted for an ad hoc single-file edit.
  | { type: 'applyCodeEdit'; path: string; edits: CodeEditHunk[]; confirmed?: boolean; planId?: string }
  // The Think -> Plan boundary for code edits, mirroring proposeExecutionPlan exactly — never
  // executes anything itself (CodeEditPlanner.buildCodeEditPlan is a pure function, same
  // never-calls-execute() discipline as ExecutionPlanner.buildPlan()). `description` is a short
  // human-readable summary of the whole batch, recorded into a new codingEditRequest Memory Graph
  // entity purely so the resulting ExecutionPlan's sourceReportId still points at something real
  // (see ExecutionLifecycle.ts's doc comment on that field, and codingEditRequestEntities.ts).
  | {
      type: 'proposeCodeEditPlan';
      description: string;
      edits: { path: string; edits: CodeEditHunk[]; rationale: string }[];
    }
  // Coding Runtime V2, Validation Pipeline (§12) — a real, code-enforced syntax -> imports ->
  // typeCheck -> lint -> build -> tests sequence, aggregated into one structured ValidationReport
  // (never fabricating a result for a step the project doesn't define) and persisted through the
  // Memory Graph so the Self-Healing Workflow (§13) and future sessions can reuse a real historical
  // record instead of re-deriving one. `affectedFiles` scopes the cheap syntax/imports checks to
  // just the files an edit batch touched; omitted means the whole project (via the Repository
  // Semantic Index, built on demand if missing/stale — same self-sufficiency principle as
  // DiscoverAffectedFilesPlugin). Not destructive — same reasoning as buildProject: running
  // lint/typecheck/build/test scripts doesn't deploy or overwrite anything sensitive.
  | { type: 'runValidationPipeline'; rootPath: string; affectedFiles?: string[] }
  // Coding Runtime V2, Coding Runtime Memory (§14) — deliberately model-driven, not auto-detected,
  // the same discipline as recordErrorFix: only recorded once the model or user has actually
  // articulated a decision and its reasoning, never inferred from a diff. Read-only understanding
  // like every other memory-write here — absent from CODING_EXECUTION_ACTION_TYPES on purpose, so
  // it stays available in Paw Go, not just Pro.
  | { type: 'recordArchitecturalDecision'; rootPath: string; decision: string; rationale: string; alternativesConsidered?: string[] }
  // A project-scoped preference requires rootPath; a global one (applies across every project) omits it.
  // Named `preferenceScope`, not `scope` — every ActionRequest already carries an unrelated,
  // optional `scope?: ConnectivityScope` field (see the top-level intersection type below); reusing
  // that name here would collide with it.
  | { type: 'recordCodingPreference'; preferenceScope: 'project' | 'global'; preferenceKey: string; preferenceValue: string; rootPath?: string }
  // Read-only — answers "what do you remember about this project's decisions/preferences/edit
  // history," the query behind the previously-dead `codingMemory` Workspace region. Composes
  // codingEditHistory/codingArchitecturalDecision/codingUserPreference with Phase 8's
  // codingValidationReport, never fabricating a field for a project with no memory yet.
  | { type: 'queryCodingRuntimeMemory'; rootPath: string }
  | { type: 'listWorkspaces' }
  | { type: 'getWorkspace'; rootPath: string }
  // Composes log-pattern-then-HTTP (or exit-code, for finite scripts) into
  // one "is this actually ready" check — never trust a process starting
  // (or a command exiting 0) as proof it's doing what it's supposed to.
  | { type: 'checkProcessHealth'; processId: string; url?: string; logPattern?: string; timeoutMs?: number }
  | {
      type: 'readFile';
      path: string;
      maxChars?: number;
      /** 'auto' dispatches by extension; explicit values force a specific reader regardless of extension. */
      format?: 'auto' | 'text' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'xml' | 'image-metadata';
    }
  | { type: 'listDirectory'; path: string }
  | { type: 'movePath'; from: string; to: string; confirmed?: boolean }
  | { type: 'deletePath'; path: string; confirmed?: boolean; permanent?: boolean }
  // File Runtime — search/read/organize/operate on the user's files. See
  // the phased plan: multi-criteria search + format-aware reading first,
  // then safe operations (copy/duplicate/compress/extract/merge/split/
  // restore), all reusing writeFile's self-checking confirmation precedent
  // except mergeFolders (compound multi-file risk, globally gated).
  | {
      type: 'searchFiles';
      rootPath: string;
      query: string;
      /** Substring search against file content (bounded — see contentScan.ts). */
      contentQuery?: string;
      /** Case-insensitive extension allowlist, e.g. ['.pdf', '.docx']. */
      extensions?: string[];
      modifiedAfter?: number;
      modifiedBefore?: number;
      minSizeBytes?: number;
      maxSizeBytes?: number;
      /** Fuzzy-match query against filenames instead of a literal substring. */
      fuzzy?: boolean;
      maxResults?: number;
    }
  | { type: 'copyPath'; from: string; to: string; confirmed?: boolean }
  | { type: 'duplicatePath'; path: string }
  | { type: 'compressPath'; paths: string[]; to: string; confirmed?: boolean }
  | { type: 'extractArchive'; path: string; to: string; confirmed?: boolean }
  | { type: 'mergeFolders'; from: string; to: string; onConflict: 'skip' | 'overwrite' | 'rename'; confirmed?: boolean }
  | { type: 'splitFile'; path: string; to: string; chunkSizeBytes: number; confirmed?: boolean }
  | { type: 'restorePath'; path: string }
  // Memory Graph — Paw's generic, provenance-aware long-term memory
  // (src/main/memory/). indexWorkspace is the ONE deliberate full sweep,
  // used only for first-time discovery of a workspace or an explicit
  // re-index — never invoked reactively. recordTaskProvenance is called
  // once per finalized Task Card, walking its own already-tracked action
  // list to link newly-created/modified files to the workspace, the
  // conversation, and whichever files were read earlier in the same task
  // — the Task Card's ordering IS the evidence, no separate tracking.
  | { type: 'indexWorkspace'; rootPath: string; workspaceName?: string }
  | { type: 'recordTaskProvenance'; goal: string; conversationId?: string; actions: { request: ActionRequest; result: ActionResult }[] }
  | {
      type: 'findFileSemantic';
      rootPath: string;
      question: string;
      /** A hint like 'resume' | 'proposal' | 'invoice' | ... — matched against the file's classified docType, not validated as a closed union here since the taxonomy lives with the classifier (src/main/memory/entities/fileEntities.ts), not the shared action schema. */
      docType?: string;
      client?: string;
    }
  | { type: 'getWorkspaceBundle'; workspaceRef: string }
  | { type: 'queryProvenance'; entityRef: string; question: 'lastWorkedOn' | 'createdFrom' | 'relatedTo' | 'belongsTo' }
  | { type: 'explainClassification'; entityRef: string }
  | { type: 'explainRelationship'; fromRef: string; toRef: string }
  | { type: 'findDuplicateFiles'; rootPath: string }
  | { type: 'analyzeFolder'; path: string; purpose: 'downloads-cleanup' | 'archive-suggestion' | 'temp-files' | 'sort-by-project' | 'sort-by-date' | 'sort-by-type' }
  | { type: 'getSpecialFolders' }
  // Git — status/diff/log/branch/show read-only, plus the Git Write Runtime
  // below (add/commit/createBranch/checkout). Push is still deliberately
  // not implemented — that crosses into remote/shared state, a different
  // blast radius than anything local this runtime touches.
  | { type: 'gitStatus'; cwd: string }
  | { type: 'gitDiff'; cwd: string; staged?: boolean }
  // Coding Intelligence Runtime Phase 2 — "Live Code Diff": per-file +/-
  // line counts (git diff --numstat), for the Coding Canvas, distinct from
  // gitDiff's raw unified diff text. Honestly fails for non-git projects —
  // never fabricates line counts.
  | { type: 'gitDiffStat'; cwd: string; staged?: boolean }
  | { type: 'gitLog'; cwd: string; maxCount?: number }
  | { type: 'gitBranch'; cwd: string }
  | { type: 'gitShow'; cwd: string; ref: string }
  // Git Write Runtime — every plugin runs through the same execFile-based
  // runGit() helper as the read-only plugins above (never a shell string,
  // so branch names/commit messages/paths can never inject). gitAdd isn't
  // destructive (staging is trivially reversible via git reset, and is
  // almost always the immediate precursor to a gitCommit call that IS
  // gated — see DESTRUCTIVE_ACTION_TYPES). gitCommit/gitCreateBranch/
  // gitCheckout are.
  | { type: 'gitAdd'; cwd: string; paths?: string[] }
  | { type: 'gitCommit'; cwd: string; message: string; confirmed?: boolean }
  | { type: 'gitCreateBranch'; cwd: string; branchName: string; confirmed?: boolean }
  | { type: 'gitCheckout'; cwd: string; ref: string; confirmed?: boolean }
  // Coding Runtime V2, Multi-file Editing Engine (§10) — the safety net for a committed
  // applyCodeEdit batch: `git revert --no-edit <commitSha>` via the same execFile-based runGit()
  // helper as every other git plugin. Always confirmed, same as gitCommit/gitCreateBranch/
  // gitCheckout.
  | { type: 'gitRevertCommit'; cwd: string; commitSha: string; confirmed?: boolean }
  // Autonomous Orchestration Layer workspace isolation — creates a fresh `git worktree` at
  // `worktreePath` off `baseRef` (defaulting to the repo's current HEAD) on a brand-new
  // `branchName`, via the same execFile-based runGit() helper as every other git plugin. Never
  // gated/confirmed: it only ever creates a NEW directory + NEW branch, never touches the
  // existing checkout at `cwd` — the whole point is to give autonomous work its own isolated
  // copy so it structurally cannot modify the user's live checkout. See
  // AutonomousOrchestrator.ts, which calls this directly (not model-invoked) before starting
  // any headless autonomous execution.
  | { type: 'gitCreateWorktree'; cwd: string; worktreePath: string; branchName: string; baseRef?: string }
  // Software Installation Runtime — generic across winget/npm/pip/VS Code
  // extensions, no per-application data. Installing/updating/uninstalling/
  // repairing software is inherently system-changing, so all four are
  // always confirmed. PATH mutation is deliberately its own separate
  // action, not bundled into installTool — a machine-wide side effect
  // broader than anything else this plugin system touches.
  | {
      type: 'installTool';
      manager: 'winget' | 'npm' | 'pip' | 'code-extension';
      packageId: string;
      /** Optional "<program> --version"-style command the model expects to succeed once installed — chained as a real post-install check instead of trusting a 0 exit code alone. */
      verifyCommand?: string;
      /** Optional bare executable name (e.g. "git") to check is on PATH after install — an alternative to verifyCommand when there's no natural version flag to check. */
      executableHint?: string;
      /** Optional command to launch a GUI app after install, paired with expectedProcessName, to confirm it actually opens rather than just that install exited 0. */
      launchCommand?: string;
      expectedProcessName?: string;
      confirmed?: boolean;
    }
  | { type: 'detectSoftware'; manager: 'winget' | 'npm' | 'pip' | 'code-extension'; packageId: string }
  | { type: 'updateSoftware'; manager: 'winget' | 'npm' | 'pip' | 'code-extension'; packageId: string; confirmed?: boolean }
  | { type: 'uninstallSoftware'; manager: 'winget' | 'npm' | 'pip' | 'code-extension'; packageId: string; confirmed?: boolean }
  | { type: 'repairSoftware'; manager: 'winget' | 'npm' | 'pip' | 'code-extension'; packageId: string; verifyCommand?: string; executableHint?: string; confirmed?: boolean }
  | { type: 'verifyToolInstalled'; command: string }
  // Writes to real Windows System (Machine) scope by default, requesting a
  // real UAC elevation prompt when required — never silently downgrades to
  // User scope. `preferredScope` lets the model explicitly settle for User
  // scope once the user has actually chosen that, after a prior attempt
  // reported elevation wasn't available (see systemEnvWriter.ts).
  | { type: 'setPathEntry'; entry: string; preferredScope?: 'machine' | 'user'; confirmed?: boolean }
  // Generic environment variable setter — same Machine-scope-with-elevation
  // mechanism as setPathEntry but for any named variable (JAVA_HOME,
  // ANDROID_HOME, GOPATH, ...), not PATH-specific. No per-application data;
  // the model supplies name/value for whatever tool asked for it.
  | { type: 'setEnvironmentVariable'; name: string; value: string; preferredScope?: 'machine' | 'user'; confirmed?: boolean }
  // Development Browser — a real browser window Paw drives, hard-restricted
  // (enforced in DevBrowserManager, not just by convention) to localhost/
  // 127.0.0.1/0.0.0.0 or a workspace's own recorded deployment URL. Never
  // general web browsing.
  | { type: 'openDevBrowser'; sessionId: string; url: string }
  | { type: 'refreshDevBrowser'; sessionId: string }
  // Coding Intelligence Runtime Phase 2 — "Browser Preview" + "Browser
  // Console" for the Coding Canvas, Pro only. Distinct from
  // captureBrowserScreenshot/readBrowserConsole above, which read from the
  // frozen Browser Runtime's own general-browsing sessions, not a
  // Development Browser session — devBrowserManager tracks its own
  // sessions separately.
  | { type: 'devBrowserPreview'; sessionId: string }
  | { type: 'readBrowserConsole'; sessionId: string; maxEntries?: number }
  | { type: 'readBrowserNetworkErrors'; sessionId: string }
  | { type: 'captureBrowserScreenshot'; sessionId: string }
  | { type: 'fillDevForm'; sessionId: string; fields: { selector: string; value: string }[]; submitSelector?: string; confirmed?: boolean }
  | { type: 'downloadProjectFile'; sessionId: string; url: string; savePath: string }
  | { type: 'uploadProjectFile'; sessionId: string; selector: string; filePath: string }
  // Browser Runtime — the browser as a real worker, general web (not
  // localhost-restricted like the Development Browser above). browseWeb's
  // destructiveness is conditional, same precedent as writeFile: only the
  // FIRST navigation for a given sessionId to a non-localhost/non-deployment
  // origin needs confirmed:true; once approved, that session can keep
  // navigating without re-asking every time (checked by the plugin itself,
  // not the engine's blanket gate — see DESTRUCTIVE_ACTION_TYPES comment).
  // Browser Runtime automates browsers, not browser engines — `browser`
  // (optional) requests a specific real browser (chrome/edge/brave/
  // firefox) or Paw's own ('electron'); omitted means auto-detect with
  // fallback (Chrome -> Edge -> Brave -> Paw's own browser). Once a
  // sessionId is bound to a real browser (via BrowserRuntime), every
  // subsequent action on that same sessionId keeps using it regardless of
  // whether `browser` is repeated. Firefox only supports browseWeb/
  // downloadBrowserFile today (no CDP automation) — every other action on
  // a Firefox session reports the limitation honestly instead of failing
  // silently.
  | { type: 'browseWeb'; sessionId: string; url: string; browser?: BrowserId; confirmed?: boolean }
  | { type: 'searchWeb'; sessionId: string; query: string; browser?: BrowserId }
  | { type: 'readWebPage'; sessionId: string; maxChars?: number }
  | { type: 'extractPageData'; sessionId: string; selectors?: string[] }
  | { type: 'clickElement'; sessionId: string; selector: string }
  | { type: 'scrollBrowserPage'; sessionId: string; selector?: string; direction?: 'up' | 'down'; amount?: number }
  | { type: 'waitForBrowserState'; sessionId: string; selector?: string; urlContains?: string; timeoutMs?: number }
  | { type: 'fillBrowserForm'; sessionId: string; fields: { selector: string; value: string }[]; submitSelector?: string; confirmed?: boolean }
  | { type: 'uploadBrowserFile'; sessionId: string; selector: string; filePath: string }
  // Real, verified downloads — either click a selector or trigger a URL
  // directly; goes through the driving browser's own real download
  // mechanism (CDP download interception for Electron/Chrome/Edge/Brave,
  // a watched-folder fallback for Firefox), never a bare fetch, and is
  // only ever reported successful once the file genuinely exists on disk
  // with real bytes (see DownloadBrowserFilePlugin.verify()).
  | { type: 'downloadBrowserFile'; sessionId: string; savePath: string; selector?: string; url?: string }
  | { type: 'listBrowserTabs' }
  | { type: 'closeBrowserTab'; sessionId: string }
  // "Paw should detect what browsers exist on the user's computer" — a
  // real, user-facing capability report (src/main/execution/browser/), not
  // just internal fallback logic.
  | { type: 'listAvailableBrowsers' }
  // "Prefer Edge over Chrome." — sets the fallback order BrowserRuntime
  // walks when a request doesn't name a specific browser. Read-only aside
  // from a small preferences file, no browser process is touched.
  | { type: 'setPreferredBrowserOrder'; order: BrowserId[] }
  // Paw's own browsing history/bookmarks — built from the Memory Graph's
  // existing entity versioning (every visited page is already recorded
  // there), not a read of the real browser's History/Bookmarks files.
  // "Show what I read yesterday."
  | { type: 'getBrowserHistory'; since?: number; until?: number; limit?: number }
  // "Bookmark this page." — a Memory Graph attribute on the page's own
  // entity, not a write into the real browser's live Bookmarks file.
  // Either an open session's current URL, or an explicit url.
  | { type: 'bookmarkPage'; sessionId?: string; url?: string; label?: string }
  | { type: 'listBookmarks' }
  // Browser Intelligence's memory primitives — composing existing
  // Memory Graph infrastructure, not new browser mechanisms. Call
  // recordPageSummary after actually reading/extracting a page's real
  // content and reasoning about it, so a later question — or a later
  // research task — can be answered from memory instead of re-browsing.
  // Either an open session's current URL, or an explicit url.
  | { type: 'recordPageSummary'; sessionId?: string; url?: string; summary: string }
  // "Have I already looked into this?" — checked before starting new
  // research, not after; substring search over Paw's own remembered page
  // summaries/titles/URLs.
  | { type: 'searchBrowserMemory'; query: string }
  // The Comparison Engine's output — real values Paw actually extracted
  // from each candidate's page (never invented), plus the ranking and
  // recommendation reasoned from them. Matched/versioned by topic.
  | {
      type: 'recordComparison';
      topic: string;
      candidates: { name: string; url: string; values: Record<string, string | number> }[];
      ranking: string[];
      recommendation: string;
    }
  | { type: 'getComparison'; topic: string }
  // Deterministic Comparison Workflow — a composition of the exact same
  // Browser Runtime primitives (navigate/extract/close), not a new browser
  // mechanism, that mechanically guarantees the part prompt wording alone
  // wasn't reliably producing: one real browser session opened per
  // candidate, every time, with one candidate's failure never aborting the
  // rest and every temporary tab closed afterward. Returns raw per-
  // candidate results (real extracted values or a real failure reason) for
  // the model to normalize/rank/recommend itself and then call
  // record_comparison with its own judgment — this only owns the
  // mechanics, never the reasoning. Destructiveness is conditional, same
  // precedent as browseWeb: one confirmation covers navigating to the
  // WHOLE candidate batch, not one per candidate/origin.
  | {
      type: 'runComparisonWorkflow';
      topic: string;
      candidates: { name: string; url: string }[];
      selectors?: string[];
      browser?: BrowserId;
      confirmed?: boolean;
    }
  // Long Running Research's checkpoint — call whenever pausing, whenever a
  // genuine new finding is learned, and when the research concludes.
  // `finding`, when given, is appended to this topic's accumulated
  // findings, never replaces them.
  | {
      type: 'checkpointResearch';
      topic: string;
      status: 'in_progress' | 'paused' | 'completed';
      finding?: string;
      nextSteps?: string;
      finalReport?: string;
    }
  // "Where did I leave off?" — call this FIRST when resuming or continuing
  // a research topic, before doing any new browsing.
  | { type: 'getResearchStatus'; topic: string }
  // Real CDP cookie read for an open session — always confirmed, cookies
  // can carry session tokens regardless of which profile is in use.
  | { type: 'getBrowserCookies'; sessionId: string; confirmed?: boolean }
  // "Reuse my existing login for GitHub." — drives the user's REAL
  // browser profile (already-logged-in cookies) instead of Paw's isolated
  // automation one. Only chrome/edge/brave support this. Always confirmed
  // — this is meaningfully more sensitive than ordinary browsing.
  | { type: 'reuseExistingBrowserSession'; sessionId: string; url: string; browser: 'chrome' | 'edge' | 'brave'; confirmed?: boolean }
  // "Save this webpage as PDF." / "Print this invoice." — real
  // Page.printToPDF, registered with File Runtime like any other
  // generated file. Destructiveness is conditional (overwrite), same
  // precedent as writeFile.
  | { type: 'printBrowserPageToPdf'; sessionId: string; savePath: string; confirmed?: boolean }
  // Deployment Runtime — deliberately narrowed to "build + run an
  // already-configured deploy script + verify the result responds," not
  // remote server/DNS/SSL/Nginx management (a different credential/blast-
  // radius model this pass doesn't cover).
  | { type: 'buildProject'; cwd: string; buildCommand: string; timeoutMs?: number }
  // Only key NAMES are ever returned — values commonly hold secrets that
  // shouldn't reach the model. writeEnvVar is the only way to set a value,
  // and only for a value the model is deliberately providing, never one
  // it's read back.
  | { type: 'readEnvVars'; path: string }
  | { type: 'writeEnvVar'; path: string; key: string; value: string; confirmed?: boolean }
  | { type: 'runDeployScript'; cwd: string; command: string; confirmed?: boolean }
  | { type: 'verifyDeployment'; url: string; timeoutMs?: number }
  // Error Memory — deliberately model-driven, not auto-detected: the model
  // calls recordErrorFix only once it has judged a fix actually worked.
  | {
      type: 'recordErrorFix';
      workspaceRoot: string;
      problem: string;
      cause: string;
      solution: string;
      filesChanged?: string[];
      commandsUsed?: string[];
      verification?: string;
    }
  | { type: 'findSimilarErrors'; problem: string; workspaceRoot?: string }
  | { type: 'setVolume'; level: number }
  | { type: 'arrangeWindows'; layout: 'left-half' | 'right-half' | 'maximize' }
  | { type: 'findBluetoothDevices' }
  | { type: 'findWifiNetworks' }
  | { type: 'startMeeting'; provider: 'zoom' | 'teams' | 'meet' }
  // Requirement & Asset Intelligence — Reference/Image Intelligence,
  // Asset Intelligence, and Visual Verification. Non-destructive: each
  // either only reads (analyzeReferenceImage/extractPageStructure/
  // verifyRenderedUi) or writes to a NEW derived path it generates
  // itself, never overwriting the user's original asset. `apiKey` on the
  // two vision-backed types is always injected by ConversationRuntime
  // right before execution (vision-backed actions always use Gemini
  // regardless of the active chat provider) — never model-supplied.
  //
  // Every image the user has attached this conversation stays available
  // (ConversationRuntime.pendingReferenceImages) — never a single
  // overwritten slot. `imageIndex` (1-based, matching the "Image 1, Image
  // 2..." numbering the user sees) lets the model look at one specific
  // attachment; omitted means analyze the WHOLE attached set together as
  // one reference (imageDataUrls has every pending image), matching "the
  // user should be understood as one reference set." `imageDataUrls` is
  // always injected — never model-supplied, since the model can't
  // produce image bytes itself.
  | { type: 'analyzeReferenceImage'; imageIndex?: number; imageDataUrls?: string[]; apiKey?: string }
  | { type: 'extractPageStructure'; sessionId: string; selectors?: string[] }
  | { type: 'optimizeImage'; path: string; outputPath?: string; format?: 'jpeg' | 'webp'; quality?: number }
  | { type: 'generateThumbnail'; path: string; outputPath?: string; width?: number; height?: number }
  | { type: 'generateResponsiveVariants'; path: string; outputDir?: string; widths?: number[] }
  | { type: 'generateAltText'; path: string; apiKey?: string }
  | { type: 'organizeAsset'; path: string; projectRoot: string }
  | { type: 'verifyRenderedUi'; sessionId: string; apiKey?: string }
  // Communication Intelligence Runtime — capture lifecycle. `medium` is a
  // CommunicationSourceDescriptor id (open-ended, validated against
  // CommunicationSourceRegistry, never a fixed union here — see
  // COMMUNICATION_INTELLIGENCE_RUNTIME.md §4). `apiKey` on transcribe/
  // summarize is always injected by ConversationRuntime right before
  // execution, same "always Gemini" precedent as the vision-backed actions
  // above — never model-supplied.
  // `consentConfirmed` is a real, separate gate from `confirmed` above:
  // `confirmed` is the generic "this is destructive, go ahead" signal every
  // gated action needs; `consentConfirmed` is the specific, recorded
  // affirmation that the user has the OTHER participants' consent to
  // record a meeting/phone call — required only for those two mediums
  // (see requiresConsent in CommunicationRuntime.ts), asked as its own
  // question via requirements() before `confirmed` is ever relevant.
  | { type: 'startCommunicationCapture'; medium: string; title?: string; consentConfirmed?: boolean; confirmed?: boolean }
  | { type: 'pauseCommunicationCapture'; communicationId: string }
  | { type: 'resumeCommunicationCapture'; communicationId: string }
  | { type: 'stopCommunicationCapture'; communicationId: string }
  | { type: 'processCommunication'; communicationId: string; apiKey?: string }
  | { type: 'getCommunication'; communicationId: string }
  | { type: 'getCommunicationTimeline'; scope?: import('../communication/CommunicationTypes').TimelineScope }
  | { type: 'getCompanyWorkspace'; companyId?: string; companyName?: string }
  | { type: 'getContactHistory'; participantId?: string; participantName?: string }
  | { type: 'searchCommunications'; query: import('../communication/CommunicationTypes').SearchQuery; apiKey?: string }
  | { type: 'addCommunicationNote'; communicationId: string; note: string }
  | { type: 'confirmCommunicationActionItems'; communicationId: string; actionItemIds: string[] }
  | { type: 'resumeInterruptedCommunications'; apiKey?: string }
  | { type: 'beginMobilePairing' }
  | { type: 'listPairedDevices' }
  | { type: 'unpairDevice'; deviceId: string }
  | { type: 'draftFollowupEmail'; communicationId: string; apiKey?: string }
  | { type: 'listEmailDrafts' }
  | { type: 'openMailComposeWindow'; recipient: string; subject: string; body: string }
  | { type: 'confirmEmailSent'; communicationId: string; draftId: string; recipients: string[] }
  | { type: 'setEmailDraftPrivate'; communicationId: string; draftId: string }
  | { type: 'copyTextToClipboard'; text: string }
  | { type: 'setEmailPreferences'; displayName: string; emailAddress: string; provider: import('../communication/CommunicationTypes').EmailProviderKind }
  | { type: 'getEmailPreferences' }
  // Coding Intelligence Runtime Phase 2 — Paw Go/Pro is a local capability
  // preference (no billing, no auth check), not a purchased plan. Go is
  // planning/analysis/read-only Coding Canvas only; Pro unlocks execution.
  | { type: 'getCodingMode' }
  | { type: 'setCodingMode'; mode: 'go' | 'pro' }
  // Declares/updates a coding task's checklist — available in both Go and
  // Pro (planning a checklist is analysis, not execution). Re-call with the
  // same items (updated statuses) to reflect progress; no taskId needed,
  // see TodoProgress's doc comment in ExecutionLifecycle.ts.
  | { type: 'setTaskChecklist'; items: { id: string; label: string; status: 'pending' | 'inProgress' | 'done' | 'skipped' }[] }
  // Infrastructure/DevOps/SRE Runtime — "host my website" / "deploy my
  // CRM" without naming a provider. Only used when the project has no
  // deploy script of its own (see RunDeployScriptPlugin, which always
  // takes priority) and a hosting connector is configured. Always confirmed
  // — production-impacting.
  | { type: 'deployProject'; cwd: string; environment?: 'production' | 'staging' | 'preview'; confirmed?: boolean }
  | { type: 'rollbackDeployment'; serviceName: string; confirmed?: boolean }
  // "Promote staging to production" — promotes the most recent non-production
  // deployment recorded for a service to production, without a new build,
  // via the provider's own promote capability. Always confirmed.
  | { type: 'promoteDeployment'; serviceName: string; confirmed?: boolean }
  // Read-only investigation mode toggle — mirrors getCodingMode/setCodingMode.
  | { type: 'getInfraMode' }
  | { type: 'setInfraMode'; mode: 'investigate' | 'full' }
  // Read-only status/health checks — never gated.
  | { type: 'getDeploymentStatus'; serviceName: string; repo?: string; branch?: string }
  | { type: 'listConfiguredInfraConnectors' }
  | { type: 'applyOrganizationCredential'; connectorKind: string; connectorId: string; secret: string }
  | { type: 'getApprovalQueue' }
  | { type: 'listEngineeringMemory' }
  | { type: 'getInfrastructureGraphSummary'; serviceName: string }
  // Enterprise Ticket Intelligence — reads a ticket, investigates, and
  // produces a structured engineering report. Never modifies code or
  // deploys anything itself (the model does that afterward through the
  // normal gated writeFile/gitCommit/deployProject actions, each with its
  // own confirmation) — this action alone is read-only investigation.
  | { type: 'investigateTicket'; ticketId: string; cwd?: string }
  // Lists tickets assigned to the connected account, identified server-side by each provider's
  // own "who am I" mechanism (Jira currentUser(), Linear viewer, GitHub assignee:@me) — never a
  // client-supplied username. Queries every configured project-management connector, not just
  // one. Read-only, never gated, same as investigateTicket above.
  | { type: 'listMyTickets' }
  // "Fix production" / "Production is slow" / "Users cannot login" / "Payment
  // is failing" — the same real evidence-gathering pipeline as
  // investigateTicket, just without a ticket to read first. Read-only, never gated.
  | { type: 'investigateProductionIssue'; description: string; cwd?: string }
  // Intelligence Runtime (Think-class, always available regardless of tier —
  // see THINK_ONLY_BLOCKED_ACTION_TYPES's absence of these two types).
  // Repository Intelligence — real evidence-gather -> deterministic-correlate
  // -> report pipeline (EvidenceCorrelationReportEngine.ts), read-only,
  // never gated. remoteFullName is optional — omit for a purely local
  // analysis; include ("owner/repo") to also pull real remote facts via a
  // connected source-control connector.
  | { type: 'analyzeRepository'; repoPath: string; remoteFullName?: string }
  // Same evidence pipeline as analyzeRepository, framed around a described
  // symptom rather than a general analysis — honestly scoped to what static
  // repository facts can actually support, never a fabricated root-cause
  // diagnosis of the specific bug.
  | { type: 'investigateRepoBug'; repoPath: string; symptom: string; remoteFullName?: string }
  // Website Intelligence — single-page real HTTP fetch, gathered/correlated/
  // reported through the same shared EvidenceCorrelationReportEngine.
  // Read-only, never gated, no confirmation needed (same risk class as
  // reading one web page).
  | { type: 'analyzeWebsite'; url: string }
  // Bounded, robots.txt-compliant multi-page crawl of the same origin —
  // unlike browseWeb's once-per-session approval, this always requires
  // fresh confirmation (checked by the plugin itself, not a blanket
  // DESTRUCTIVE_ACTION_TYPES entry — see BrowseWebPlugin's precedent).
  // maxPages/maxDepth are requests, clamped to hard maximums by the plugin.
  | { type: 'crawlWebsite'; url: string; maxPages?: number; maxDepth?: number; confirmed?: boolean }
  // UX Intelligence — bounded multi-page review of the same origin reusing crawlWebsite's crawler
  // and confirmation discipline (always fresh confirmation, never remembered — same reasoning as
  // crawlWebsite: reviewing multiple pages of a third-party site is a bigger action each time).
  // maxPages/maxDepth are requests, clamped to hard maximums by the plugin.
  | { type: 'reviewUx'; url: string; maxPages?: number; maxDepth?: number; confirmed?: boolean }
  // Marketing Intelligence — bounded multi-page marketing/SEO-signal review, reusing
  // crawlWebsite/reviewUx's crawler and confirmation discipline (always fresh confirmation, never
  // remembered). maxPages/maxDepth are requests, clamped to hard maximums by the plugin.
  | { type: 'analyzeMarketing'; url: string; maxPages?: number; maxDepth?: number; confirmed?: boolean }
  // Product Intelligence — pure aggregation over already-persisted Website/UX/Marketing/
  // Repository reports (no new fetch/crawl of its own), so no confirmation is needed. At least
  // one of url/repoPath is required; both may be given to aggregate a web product's repo too.
  | { type: 'scoreProduct'; url?: string; repoPath?: string }
  // Founder Intelligence — a composer over the same already-persisted reports Product
  // Intelligence reads (no separate evidence-gathering engine), producing role-framed strategic
  // recommendations. Also read-only/instantaneous, no confirmation needed.
  | { type: 'askFounderAdvisor'; url?: string; repoPath?: string }
  // Execution Planner — the Think -> Plan boundary. The ONE Execute-class action in the entire
  // Intelligence capability area (see CODING_EXECUTION_ACTION_TYPES below): every other
  // Intelligence action is read-only analysis. Builds a reviewable ExecutionPlan from a report's
  // user-approved findings; never executes anything itself — see ExecutionPlanner.ts.
  | { type: 'proposeExecutionPlan'; engineId: IntelligenceReport['engineId']; subject: string; approvedFindingIds: string[] }
  // Autonomous Engineering Task billing (PAWOS_PRICING_AUDIT.md) — these
  // three never touch the local filesystem or run any code themselves;
  // they only report the lifecycle of an autonomous, org-scoped ticket
  // workflow to Organization Runtime for billing. Handled entirely in the
  // renderer (direct-Supabase, like every other org action) rather than by
  // any DesktopExecutionEngine plugin — see AutonomousTaskBillingGate.ts.
  // Never gated as destructive: starting/failing/cancelling a billing
  // record has no real-world side effect, and completing one only ever
  // fires after the model has already done the actual (separately gated)
  // work — writeFile/gitCommit/deployProject each already required their
  // own confirmation before this is ever called.
  // organizationId is optional — omit it for an individual (Pro/Pro Max,
  // no organization) run against that account's own Ticket Balance; see
  // AutonomousTaskBillingGate.ts.
  | {
      type: 'startAutonomousEngineeringTask';
      organizationId?: string;
      workspaceId?: string;
      ticketSource?: 'jira' | 'github' | 'linear' | 'azureDevOps';
      ticketId?: string;
      repository?: string;
      /** Local checkout path for the repository this ticket concerns — required for the Autonomous
       *  Orchestration Layer to actually drive investigate/plan/edit/validate (see
       *  AutonomousOrchestrator.ts). Omitted entirely falls back to the pre-orchestration behavior
       *  (a billing/entitlement wrapper only, no automatic execution) — never fabricated or guessed. */
      cwd?: string;
      ticketTitle?: string;
      ticketDescription?: string;
    }
  | { type: 'completeAutonomousEngineeringTask'; runId: string; prUrl?: string; clientReplySent?: boolean; deployCompleted?: boolean }
  | { type: 'endAutonomousEngineeringTask'; runId: string; status: 'failed' | 'cancelled' | 'retry_limit_reached' }
  // Read-only Deployment Intelligence helpers — never gated.
  | { type: 'compareDeployments'; serviceName: string }
  | { type: 'discoverInfrastructure' }
  | { type: 'searchInfrastructure'; query: string }
  // Team & Enterprise Phase 3 — Git Collaboration. Reading PRs is investigation,
  // never gated, same as getDeploymentStatus/investigateTicket above. AI review
  // itself is also read-only (fetch diff, generate a structured review) unless
  // postComment is set, in which case it follows writeFile's own precedent:
  // conditional destructiveness checked by the plugin at execute time, not a
  // blanket DESTRUCTIVE_ACTION_TYPES entry, since only the plugin knows whether
  // this particular call will actually write an external comment.
  | { type: 'listPullRequests'; repo: string; provider?: 'github' | 'gitlab' }
  | { type: 'aiReviewPullRequest'; repo: string; prNumber: number; provider?: 'github' | 'gitlab'; postComment?: boolean; confirmed?: boolean }
  // Office Intelligence Runtime — Document Intelligence. Both create a new
  // file, so they share writeFile's "confirm only when overwriting an
  // existing path" discipline, checked per-request, not a blanket gate.
  | { type: 'mergePdfs'; inputPaths: string[]; outputPath: string; confirmed?: boolean }
  | {
      type: 'createDocx';
      outputPath: string;
      title?: string;
      sections: { heading?: string; paragraphs: string[] }[];
      confirmed?: boolean;
    }
  // Spreadsheet Intelligence — real .xlsx via the xlsx (SheetJS) library.
  // formulas are real spreadsheet formulas (no leading '='), set on
  // specific cells after the row data is written.
  | {
      type: 'createSpreadsheet';
      outputPath: string;
      sheets: { name: string; rows: (string | number)[][]; formulas?: { cell: string; formula: string }[] }[];
      confirmed?: boolean;
    }
  // Read-only real column statistics (count/sum/avg/min/max) for every
  // numeric column in a real spreadsheet — never a fabricated pivot table.
  | { type: 'analyzeSpreadsheet'; filePath: string; sheetName?: string }
  // Presentation Intelligence — real .pptx via pptxgenjs. Charts are real
  // rendered chart objects (pptxgenjs supports bar/line/pie/doughnut/area/
  // scatter/radar/bubble natively) — never a static image pretending to be one.
  | {
      type: 'createPresentation';
      outputPath: string;
      theme?: { primaryColor?: string; backgroundColor?: string };
      slides: {
        title?: string;
        bullets?: string[];
        notes?: string;
        chart?: { kind: 'bar' | 'line' | 'pie' | 'doughnut' | 'area'; categories: string[]; series: { name: string; values: number[] }[] };
      }[];
      confirmed?: boolean;
    }
  // Read-only — most recently created/modified documents/spreadsheets/presentations. Never gated.
  | { type: 'listRecentOfficeFiles' }
  // General-purpose Email Intelligence — records that a browser-compose
  // email (opened via the existing openMailComposeWindow) was actually
  // sent, once the user explicitly confirms it, same "never assume sent"
  // discipline as confirmEmailSent, just not tied to a communication session.
  | { type: 'confirmGeneralEmailSent'; recipient: string; subject: string }
  // Companion Memory (Paw Companion Runtime) — goals/routines scoped to a
  // specific companion id, stored in the generic Memory Graph via
  // companionEntities.ts. Never gated; all honestly no-op if the caller
  // passes an id for a companion that's never been referenced before (the
  // anchor node is created lazily on first real write).
  | { type: 'recordCompanionGoal'; companionId: string; text: string }
  | { type: 'listCompanionGoals'; companionId: string }
  | { type: 'completeCompanionGoal'; goalId: string }
  | { type: 'recordCompanionRoutine'; companionId: string; description: string; cadence?: string }
  | { type: 'listCompanionRoutines'; companionId: string }
  | { type: 'getCompanionMemorySummary'; companionId: string }
  | { type: 'resetCompanionMemory'; companionId: string; confirmed?: boolean }
  // Capability-connect actions — activates a connector in-memory for the current process.
  // Authenticated persistence goes straight to the Supabase Vault from the renderer.
  | { type: 'connectJiraCredential'; baseUrl: string; email: string; apiToken: string }
  // Generic counterpart to connectJiraCredential for any non-apiToken (OAuth2/PKCE) ConnectorSDK
  // — dispatches straight to ConnectionManager.connect(), which itself drives the interactive
  // browser consent flow. `incrementalCapabilities`, when set, requests only those capabilities'
  // backing scopes instead of a full reconnect (see CapabilityRequirementResolver's
  // 'incrementalScope' grantMode). Persistence (Vault or Guest-mode store) happens inside the
  // connector's own connect() implementation, exactly like Jira's does today.
  | { type: 'connectivityConnect'; connectorId: string; incrementalCapabilities?: string[] }
);

export type KnownAppId =
  | 'vscode'
  | 'cursor'
  | 'visualstudio'
  | 'intellij'
  | 'androidstudio'
  | 'chrome'
  | 'edge'
  | 'explorer'
  | 'notepad'
  | 'terminal';

export type ActionResult =
  | { ok: true; data?: unknown; trail?: ExecutionTrail }
  // data on a failure carries a plugin's own diagnostic state forward (e.g. what was
  // installed/run before verify() failed) so recover() has something real to act on,
  // not just a message string.
  | {
      ok: false;
      reason:
        | 'not-implemented'
        | 'requires-confirmation'
        | 'coding-mode-restricted'
        | 'infra-mode-restricted'
        | 'entitlement-restricted'
        | 'usage-restricted'
        | 'balance-restricted'
        | 'security-restricted'
        | 'cancelled'
        | 'failed';
      message?: string;
      data?: unknown;
      trail?: ExecutionTrail;
      /** Present only when reason === 'requires-confirmation'. Absent = today's plain yes/no
       *  confirmation prompt, unchanged. Present with kind: 'connectCapability' = render a
       *  connect action (RequirementGate's capability resolver) instead of a yes/no prompt. */
      confirmation?: { kind: 'yesNo' | 'connectCapability'; capabilities?: CapabilityConfirmation[] };
      /** Approval ID for tracking this specific requires-confirmation request through the approval → resume flow. */
      approvalRequestId?: string;
    };

/**
 * Destructive action types require an explicit `confirmed: true` before
 * executing — enforced once, globally, by DesktopExecutionEngine, so no
 * individual plugin can forget it. writeFile isn't here because its
 * destructiveness is conditional (only when overwriting an existing file),
 * which only the plugin itself can check at execute time.
 */
export const DESTRUCTIVE_ACTION_TYPES: ActionRequest['type'][] = [
  'createFolder',
  'runCommand',
  'movePath',
  'deletePath',
  'installTool',
  'updateSoftware',
  'uninstallSoftware',
  'repairSoftware',
  'setPathEntry',
  'setEnvironmentVariable',
  'fillDevForm',
  'writeEnvVar',
  'runDeployScript',
  'fillBrowserForm',
  'mergeFolders',
  'getBrowserCookies',
  'reuseExistingBrowserSession',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'gitRevertCommit',
  'deployProject',
  'rollbackDeployment',
  'promoteDeployment',
  // Recording a real conversation is always confirmed — same explicit-
  // grant discipline as the Capture Layer permission model in
  // COMMUNICATION_INTELLIGENCE_RUNTIME.md §5.2, never a silent background start.
  'startCommunicationCapture',
  // Note: Communication Intelligence Runtime's email actions
  // (openMailComposeWindow/confirmEmailSent/setEmailDraftPrivate/
  // copyTextToClipboard/setEmailPreferences) are deliberately NOT here —
  // none of them send anything. Paw only ever opens a prefilled browser
  // compose window; the human clicks Send themselves in their own browser,
  // under their own account. confirmEmailSent only ever records what the
  // user just explicitly told Paw happened. setEmailPreferences stores a
  // plain, unauthenticated preference (which provider's compose URL to
  // build) — never a credential.
  // gitAdd isn't here — see its own comment in the ActionRequest union
  // above; staging is trivially reversible and almost always the immediate
  // precursor to a gated gitCommit call.
  // browseWeb isn't here — its destructiveness is conditional (only the
  // first navigation to a new, non-localhost/non-deployment origin for a
  // given session), same precedent as writeFile above. copyPath/
  // compressPath/extractArchive/splitFile self-check destination
  // collisions the same way (see the plugins), so they aren't here either
  // — only mergeFolders carries genuine compound multi-file risk that a
  // single per-request check can't fully capture.
  // Companion Memory's reset is real, irreversible data loss (deletes real
  // goal/routine entities) — always confirmed, same as any other delete.
  'resetCompanionMemory',
];

/**
 * Coding Intelligence Runtime Phase 2 — Paw Go/Pro gate. Everything here is
 * refused up front with a fixed message (see DesktopExecutionEngine.execute()),
 * before the destructive-action gate above is ever reached, whenever either
 * (a) the subscription tier itself lacks the 'advancedRuntimes' entitlement
 * (Go tier — always refused, regardless of the local mode file) or (b) the
 * tier has it but the user's own local CodingModeStore preference is still
 * 'go' (a safety default even Pro+ users can choose). Read-only coding
 * actions (analyzeProject, explainRelationship, queryProvenance, gitDiff,
 * listProcesses, and the new Phase 2.3
 * AnalyzeProjectStructurePlugin/AnalyzeFileImpactPlugin) are deliberately NOT
 * here — Paw Go's "read-only Coding Canvas / Project Memory / Coding Memory /
 * dependency & file-impact analysis" stays available.
 */
export const CODING_EXECUTION_ACTION_TYPES: ActionRequest['type'][] = [
  'writeFile',
  'deletePath',
  'gitAdd',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'gitRevertCommit',
  'runCommand',
  'startProcess',
  'buildProject',
  'devBrowserPreview',
  // Execution Planner's one Execute-class action — see proposeExecutionPlan's own comment above.
  // Generating a plan is gated Pro+ alongside every other real mutating action; every other
  // Intelligence action (analyze/crawl/review/score/advise) is deliberately NOT in this list.
  'proposeExecutionPlan',
  // Coding Runtime V2, Multi-file Editing Engine — the same real-mutating-work gating as writeFile;
  // every other Coding Runtime V2 analysis action (buildDependencyGraph/discoverProjectFeatures/
  // classifyProjectAssets/detectDomainConcepts/buildRepositorySemanticIndex/discoverAffectedFiles)
  // is deliberately NOT here — Paw Go's read-only understanding stays available, only real edits
  // require Pro+.
  'applyCodeEdit',
  'proposeCodeEditPlan',
  'runValidationPipeline',
];

/**
 * Infrastructure Runtime — "read-only investigation mode" gate. Refused
 * before the destructive-action confirmation gate is ever reached, same
 * tier-then-local-toggle order as Paw Go/Pro above: unconditionally when the
 * tier lacks 'advancedRuntimes' (Go — regardless of InfraModeStore's local
 * file), otherwise only in 'investigate' mode. Read-only infra actions
 * (investigateTicket, getDeploymentStatus, listConfiguredInfraConnectors)
 * are deliberately NOT here — investigation always stays available.
 */
export const INFRA_EXECUTION_ACTION_TYPES: ActionRequest['type'][] = ['deployProject', 'rollbackDeployment', 'promoteDeployment'];

/**
 * Something a plugin needs before it can execute a request — surfaced as a
 * natural-language follow-up question instead of executing blind or failing
 * silently (the "Collect Missing Information" pipeline step).
 */
export type ActionRequirement = {
  id: string;
  message: string;
  /** Present when this requirement should be resolved by RequirementGate (a capability check
   *  today; later possibly confirmation/approval/selection) rather than surfaced as a plain
   *  natural-language question. Absent = today's exact behavior, unchanged. */
  resolvable?: Requirement;
};
