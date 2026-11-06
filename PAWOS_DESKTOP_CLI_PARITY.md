# PawOS Desktop–CLI Capability Parity

Audit date: 2026-11-05. Statuses describe source evidence; verified test behaviors are marked explicitly. Desktop is inspected from source, not a live exhaustive UI run.

## Capability comparison

| Capability | Desktop evidence | CLI evidence | Desktop / CLI | Gap / priority |
|---|---|---|---|---|
| Folder selection / workspace initialization | `src/main/ipc/handlers/selectFolderHandler.ts`, renderer `ProjectOpener.tsx` | Starts in cwd; `pawos-cli/src/local/workspace.ts` | IMPLEMENTED / VERIFIED | CLI relies on shell navigation, no folder picker (P3). |
| Project analysis and structure | `ProjectAnalyzer.ts`, `ProjectMapBuilder.ts`, `AnalyzeProjectStructurePlugin.ts` | bounded list/search plus agent loop | IMPLEMENTED / VERIFIED by suite | Desktop richer project maps/index. P2. |
| Git and non-Git projects | Desktop workspace/project plugins | `detectWorkspace`, non-Git fallback | IMPLEMENTED / VERIFIED | Both support non-Git local work. |
| File read/search/create/edit/delete/move | `ReadFilePlugin`, `SearchFilesPlugin`, `WriteFilePlugin`, `DeletePathPlugin`, `MovePathPlugin` | `local/tools.ts`, `changes.ts` | IMPLEMENTED / PARTIAL | CLI supports read/search/create/edit/delete/folders; no general move/rename tool found (P2). |
| Workspace boundary, ignore/secrets | `ProjectBoundaryEnforcement.ts`, `CodingRuntimeSecurity.ts` | canonical/symlink path checks, protected-file exclusions | IMPLEMENTED / VERIFIED by suite | Separate, narrower CLI implementation. |
| Goal planning and multi-file coding | `ExecutionPlanner.ts`, `CodeEditPlanner.ts`, `DesktopExecutionEngine.ts` | `local/agent.ts`; backend one-turn planner | IMPLEMENTED / VERIFIED by suite | CLI agent is real but does not reuse Desktop engine; relies on backend (P1). |
| Recovery and retry | `RecoverByRetry.ts`, engine retry path | bounded busy/truncated retries; generic agent loop | IMPLEMENTED / PARTIAL | No Desktop validation recovery pipeline parity (P1). |
| PowerShell/CMD selection | `shellExec.ts`, `ActionTypes.ts`, `commandSafety.ts` | fixed executable/argv allowlist | IMPLEMENTED / NOT IMPLEMENTED | No user-selectable shell in CLI (P1). |
| Foreground command, output, exit, timeout, cancel | `shellExec.ts`, `ExecutionCancellation.ts` | `local/process.ts`, `local/commands.ts` | IMPLEMENTED / VERIFIED by suite | CLI restricts program set and command shapes. |
| Background process management | `ProcessManager.ts`, process plugins and verification | `BackgroundProcesses`, max 3, stopped at CLI exit | IMPLEMENTED / PARTIAL | No persistent process registry/restart/health checks (P2). |
| Local preview/browser | `BrowserRuntime.ts`, browser plugins | localhost-only open with approval; actual printed URL | IMPLEMENTED / PARTIAL | CLI cannot see/inspect page or validate visual preview (P2). |
| Git status/diff/history | Desktop Git plugins | `local/tools.ts` | IMPLEMENTED / VERIFIED by suite | Similar local read operations. |
| Branch/stage/commit/push | Git operation plugins | `local/gitChanges.ts`, confirmation plans | IMPLEMENTED / VERIFIED by suite | No CLI pull; local push separately approved. |
| GitHub issues, PR inspect/create | `infrastructure/GitHubPRPlugin.ts`, ticket plugins | `/github` issue/PR/file reads, comments; no CLI PR-create tool found | IMPLEMENTED / PARTIAL | No proven issue-to-branch/PR lifecycle (P1). |
| PATH/env diagnosis and repair | `SetPathEntryPlugin.ts`, `SetEnvironmentVariablePlugin.ts`, `systemEnvWriter.ts`, `envRefresh.ts`, `toolVersionCheck.ts` | No equivalent CLI tools | IMPLEMENTED / NOT IMPLEMENTED | High-priority gap (P1). Desktop handles User/Machine, UAC choice and fresh cmd/PowerShell verification. |
| Tool install/update/uninstall/repair | `InstallToolPlugin.ts`, update/uninstall/repair/detect plugins, `softwareManager.ts` | None; `winget`/shells excluded by CLI policy | IMPLEMENTED / NOT IMPLEMENTED | High-priority gap (P1). Desktop manager support is specific; don't claim all package managers. |
| Dependency install | Desktop software/build plugins | npm/pip/yarn/pnpm commands require approval | IMPLEMENTED / PARTIAL | CLI installs project deps, not full toolchain diagnosis/setup (P1). |
| Syntax/type/lint/test/build | `src/main/execution/validation/*`, `RunValidationPipelinePlugin.ts`, `BuildProjectPlugin.ts` | Project-defined test/build in `local/commands.ts` | IMPLEMENTED / PARTIAL | No unified pipeline/report; type/lint only run if project scripts are requested (P1). |
| Targeted validation repair | Desktop validation diagnosis and engine recovery | Agent can inspect output and request another approved step | IMPLEMENTED / PARTIAL | No pipeline-specific retry contract/final verification (P1). |
| Autonomous ticket execution | `InvestigateTicketPlugin.ts`, `ListMyTicketsPlugin.ts`, renderer `AutonomousOrchestrator.ts`, governance/approval services | `commands/autonomous.ts` backend workflow | IMPLEMENTED / PARTIAL, live flow NOT VERIFIED | End-to-end CLI branch/PR/deploy outcome not demonstrated (P1). |
| Connected integrations/MCP | `src/shared/connectivity/ConnectorSDK.ts`, `src/main/infrastructure/connectors/**` | `/connections`, `/connect`, `/github`, `/linear`, `/tools`; MCP server-relayed | IMPLEMENTED / PARTIAL | CLI requires PawOS backend and exposes narrower surface; no independent connector SDK/provider tokens (P1/P2). |
| Work records/history | `src/shared/actions/WorkRecord.ts`, `ExecutionRecordTypes.ts`, activity/memory stores | local completion summary/checkpoint and backend chat history | IMPLEMENTED / PARTIAL | Not equivalent to durable structured Work Record with approvals, retries, timestamps and validation evidence (P2). |
| Deployments | `infrastructure/DeployProjectPlugin.ts` and hosting connectors | No CLI deploy tool found | IMPLEMENTED / NOT IMPLEMENTED | Do not infer deploy from shared model; retain explicit permissions if added (P1/P2). |
| Avatar, animation, voice, meeting UI | renderer CompanionCanvas/avatar/audio and `MeetingService.ts` | text terminal / ASCII mark | IMPLEMENTED / DESKTOP ONLY | Graphical presentation need not be duplicated (P3); headless meeting use should be API-backed. |
| Offline/update | Desktop platform updater; CLI package management | CLI local processes are local; reasoning needs PawOS API; npm updates | IMPLEMENTED / PARTIAL | No CLI updater or offline model (P3). |

## Desktop connector inventory

Source tree includes GitHub, GitLab and Bitbucket source control; Jira and Linear project management; Slack communication; Vercel, Netlify, Render, Railway, Fly.io, AWS/Azure/GCP/DigitalOcean/Hetzner and other hosting connectors; GitHub Actions and GitLab CI. `ConnectorSDK` ties capabilities to scopes. This means implementation exists, not that every account has access or a connection. CLI has selected GitHub/Linear calls and relays PawOS tool/MCP capabilities; it does not expose all connectors as local commands.

## Recommended priorities

1. P1: safe PATH and environment diagnosis/repair via Desktop's tested scope, elevation, refresh and fresh-shell verification patterns.
2. P1: dedicated tool detection/install/update/repair with preview, confirmation, verification and bounded recovery.
3. P1: unified CLI validation and final verification with honest reports and retry caps.
4. P1: prove and expose ticket-to-code/PR workflows through existing authorized backend contracts.
5. P2: improve server health/preview and persist structured execution records.
6. P2: surface more connectors through backend capability discovery without duplicating credentials or bypassing scopes.
7. P3: do not recreate avatar/animation UI; expose only useful headless workflows.
