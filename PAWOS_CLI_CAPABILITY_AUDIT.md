# PawOS CLI Capability Audit

Audit date: 2026-11-05. Scope: current working tree; numerous pre-existing changes were present and preserved.

## Summary

The CLI is an executing local development agent. `pawos-cli/src/local/agent.ts` runs a backend-directed tool loop and `pawos-cli/src/local/tools.ts`, `changes.ts`, `commands.ts`, `process.ts`, and `gitChanges.ts` implement local actions. The CLI handles Git and non-Git project folders, bounded file reads/search, file creation/edit/deletion with approval, local commands/tests/builds, session-owned servers, local Git changes, checkpoints/undo, GitHub/Linear tools and backend-relayed MCP. It does not reuse Desktop's execution engine.

Actual CLI package version: **1.2.0** (`pawos-cli/package.json`, lockfile root and `src/config.ts`). Desktop root is a separate package/version, `companionos` 1.0.4. A checked-in `pawos-cli/revantaai-pawos-cli-1.1.0.tgz` is stale; no Git tags were listed. CLI is npm-managed separately from the pnpm Desktop root, requires Node >=20, and bundles `dist/pawos.js` via esbuild. No version was changed.

## Architecture and commands

- Entry/routing: `pawos-cli/src/index.ts`, `src/cli.ts`; local interactive shell: `src/commands/interactive.ts`.
- Shared auth/API/task runner: `pawos-shared/src` via `pawos-cli/src/shared.ts`; backend supplies model turns; CLI contains no model key.
- Commands: `pawos`, `login`, `logout`, `status`, `help`, `version`; interactive commands include `/help`, `/chat`, `/code`, `/mode`, `/connections`, `/connect`, `/tools`, `/github`, `/linear`, `/undo`, `/stop` and Autonomous Work.
- Auth uses PKCE. Refresh token/email go to the OS credential store or protected fallback outside project; access token is memory-only (`auth/sessionStore.ts`).
- Package scripts: typecheck/build/test/prepack. Public npm metadata exists, but clean install and pack contents were not verified.

## Capability detail

### Filesystem and agent

`local/workspace.ts` selects the Git root or current acceptable non-Git project; it rejects drive roots, home ancestors and OS folders. It checks real paths/symlinks, excludes `.git`, generated/dependency folders, `.env` secrets and credential files, and caps results. Reads include list/search/read plus Git status/diff/log. Writes support create/edit/replace/delete and needed folder creation. Changes are shown and approved; deletion always asks; checkpoints back `/undo` and avoid overwriting later user changes. Multi-file work is sequential with per-operation policy. Workspace is invocation folder/Git root, not arbitrary disk-wide access.

The loop sends bounded project metadata to PawOS, validates each returned tool locally, runs the step, returns its result and continues until finish/cancel/failure/limits. It supports read-only plan mode, ask/auto modes, cancellation, fixed step/time/output budgets and bounded retry on model busy/truncation. Reasoning and model routing remain backend-dependent. The separate backend code-change polling flow is not the same as local execution.

### Commands, processes, validation

`local/commandPolicy.ts` allows npm, npx, node, git, python/py, pip, yarn, pnpm, java and javac. Shell operators are refused and commands use argument arrays. Common development commands can run in auto; installations, unknown commands and project programs require confirmation; unsafe commands and Git mutations by raw command are refused. Project test/build scripts are derived from project configuration. `local/process.ts` captures bounded output/exit codes, strips secret-like environment variables, applies timeouts/cancellation, and kills process trees. Up to three background programs are tracked and stopped on CLI exit. CLI has no general PowerShell/CMD selection, arbitrary shell, persistent daemon, or control of processes it did not start.

CLI can run requested tests/builds and return errors to the agent for a targeted next step. It lacks Desktop's unified fixed validation pipeline/report, static type/import/syntax/lint orchestration, and pipeline-specific bounded repair policy.

### Git, integrations, records

Local status/diff/log and dedicated stage/commit/branch/switch/push operations exist; plans show scope, changes require approval, push always asks, checkout protects uncommitted work. No CLI pull or broad remote management. Local push is not PR creation.

`/github`, `/linear`, `/connections`, `/connect`, `/tools` use PawOS server APIs; comments ask before posting, CLI holds no provider tokens. MCP is relayed via PawOS (no standalone host/client). Desktop GitLab/Bitbucket/Slack/Jira/Vercel and hosting/CI connectors are not all exposed as CLI-specific tools. CLI local summary/checkpoints/backend chat history are not a full durable Desktop Work Record. Autonomous Work exists as a backend workflow, but end-to-end ticket-to-PR/deploy was not live-tested.

### PATH and environment

**Not implemented in CLI.** No registry inspection, PATH diagnosis/repair, fresh-shell CMD/PowerShell verification, JAVA_HOME/ANDROID_HOME writes, UAC, winget, or install/update/uninstall/repair tools. An executable not found is only reported as a command launch failure. Desktop implements these in `SetPathEntryPlugin.ts`, `SetEnvironmentVariablePlugin.ts`, `systemEnvWriter.ts`, `envRefresh.ts`, `toolVersionCheck.ts`, and software manager plugins.

## Security

Local path boundary, symlink validation, protected-file exclusions, tool-name risk classification, exact approvals, constrained command allowlist/argv, output/time caps, secret-filtered child env, process tree stop, Git config safety and checkpoint recovery are present. Backend cannot mark a risky operation approved. Auth never stores access tokens or provider credentials in the project. Source review/test coverage is not a penetration test. No system PATH changes were attempted.

## Verification

| Check | Result |
|---|---|
| `node pawos-cli/dist/pawos.js --help`, `--version` | VERIFIED; both identify v1.2.0. |
| CLI full Vitest suite | FAILED: 33/34 files, 1,335 passed, 2 failed. |
| Isolated `src/ui/prompter.test.ts` | FAILED again: 24 passed, 2 prompt-history failures (Up-arrow restoration). Reproducible. |
| Test-harness local operations | VERIFIED: temporary Git/non-Git, file edits/undo, approvals/denials, real Node/npm/Git commands, server lifecycle. This is harness evidence, not live account evidence. |
| Live authenticated PawOS / GitHub / Linear / ticket workflow | NOT VERIFIED; not run with credentials/disposable remote. |
| CLI deterministic build/typecheck, Desktop build/typecheck | NOT VERIFIED; output/individual exit evidence was unavailable, Desktop check interrupted. |
| PATH repair and fresh-install Windows package | NOT IMPLEMENTED / NOT VERIFIED. |

## Blockers

1. P1: fix reproducible prompt history tests in `src/ui/prompts.ts` while retaining typed-ahead and approval isolation guarantees.
2. P1 parity gap: CLI has no environment/PATH diagnosis or repair.
3. P1: validate live auth/API workflow and clean Windows install/keyring fallback.
4. P2: add unified validation and full durable work records; confirm ticket-to-PR support before claims.
5. Refresh stale 1.1.0 archive during a separately authorized release prep; source package is 1.2.0.
