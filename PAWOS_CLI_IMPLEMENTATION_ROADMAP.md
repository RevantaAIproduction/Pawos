# PawOS CLI Implementation Roadmap

Audit-derived plan only. The current CLI has a functioning local agent loop; do not replace it wholesale. Keep local boundaries, exact confirmations and independent tool validation.

| Priority / phase | Capability | Why missing / reuse | Required implementation and security | Tests / complexity |
|---|---|---|---|---|
| P0 release gate | Prompt history | Two existing `src/ui/prompter.test.ts` cases reproduce. Reuse existing terminal prompter. | Fix Up-arrow/history without allowing stale typed-ahead input to answer approvals. | Retain typed-ahead/approval tests; add regressions. Low–medium. |
| P1.1 | PATH/tool diagnosis | CLI reports command-not-found but has no environment diagnosis. Reuse Desktop patterns in `toolVersionCheck.ts`, `envRefresh.ts`; keep OS-independent DTOs shared if practical. | Read-only PATH scope/version checks; executable paths and PowerShell/CMD resolution; never dump all env/secrets. | Fake PATH/registry fixtures, case variants, stale process env, fresh shells. Medium. |
| P1.2 | PATH/env repair | No CLI writer. Desktop has `SetPathEntryPlugin`, `SetEnvironmentVariablePlugin`, `systemEnvWriter.ts`. | Plan exact variable/scope; explicit consent; preserve existing entries; dedupe; no silent elevation/downgrade; refresh current env; verify in fresh PowerShell and CMD. | Mock writer first; disposable Windows user/VM only; test decline, duplicates, elevation refusal, verification failure. High. |
| P1.3 | Development tool lifecycle | CLI has no tool installer. Desktop uses `softwareManager.ts` and install/update/uninstall/repair/detect plugins. | Typed manager/package operations; show exact target; explicit approval for mutations; verify executable/version; bounded recovery, no administrator action without consent. | Stub process; prove decline launches nothing; tests for already installed, failed verify/recovery and package IDs. High. |
| P1.4 | Unified validation | CLI can run project scripts; Desktop has validation runners, diagnosis and reports. | Detect project-supported syntax/type/lint/test/build checks, present plan, run within process limits, diagnose, retry targeted changes only to a fixed cap, final rerun/report. Extract report types or thin adapters rather than import Electron engine. | Missing scripts, individual failures, cancellation, retry cap, no false green. Medium–high. |
| P1.5 | Ticket → code → PR | CLI has `/github`, `/linear`, `/autonomous`, but live flow not verified and no clear PR-create command. Desktop has `InvestigateTicketPlugin`, `GitHubPRPlugin`, orchestration/governance. | Document and use existing authenticated backend contract; investigate/evidence, plan, branch, approved changes/tests, review diff, separately approve push/PR. No provider token storage. | Mock backend plus disposable repo/remote and test credentials; verify every approval/scope. High. |
| P2.1 | Server/preview | CLI sessions track up to 3 processes and stop on exit; browser isn't observable. Desktop has `ProcessManager` and health verification. | Decide persistence requirement; improve readiness/health/output before considering detached persistence. | Child-tree, port conflict, startup failure, stop, no invented URL. Medium. |
| P2.2 | Work Records | CLI provides summary/checkpoint, not a full durable record. Desktop types in `src/shared/actions/WorkRecord.ts`. | Reuse compatible record schema/backend; capture goal, approvals, redacted commands, files, validation, retries, times, status. Define retention and local storage. | Secret redaction, interrupted runs, restoration, record completeness. Medium. |
| P2.3 | Integrations/MCP coverage | CLI delegates tools to PawOS but narrower CLI surface. Connector SDK/backend already handles scopes and credentials. | Add structured routes through server capability discovery only; preserve existing credential/permission checks; no generic arbitrary URL/command tool. | Connected/not connected, plan/scope refusal, reads vs confirmed writes, malformed server response. Medium–high. |
| P3 | Desktop interface features | Avatar, animation and voice UI have no terminal equivalent need. | No avatar rewrite; add headless meeting workflows only if supported APIs justify them. | API permission and transcript privacy coverage. Low–medium. |

## Architecture principles

- Keep `pawos-cli/src/local/agent.ts` as the CLI orchestrator; don't merge the Electron Desktop engine.
- Share domain types and platform-neutral diagnostics/reporting where feasible; isolate registry/UAC/process actions behind explicit adapters.
- The backend cannot certify a local action safe or approved. CLI checks tool names, arguments, risk, workspace and consent itself.
- Continue to separate plan, ask and auto semantics; deletion, push, install and machine configuration stay explicitly gated.
- Use PawOS backend credentials/connectors; do not place provider tokens in CLI or bypass Connector SDK permissions.

## Release and validation sequence

1. Fix the two reproducible prompt-history failures and pass full CLI suite.
2. Capture individual deterministic typecheck/build exit codes, run `npm pack --dry-run`, inspect tar contents, install the archive in a fresh Windows directory with Node 20+, and validate help/version/keyring fallback.
3. Use a non-production test account for login, an authenticated local task, logout and API compatibility; redact all credentials.
4. Run disposable Git/non-Git fixtures through actual local execution for file operations, commands, tests/build, servers, permission denial and undo.
5. Test future environment changes only in a Windows VM/disposable account; verify new CMD and PowerShell processes. Never mutate real machine PATH in automated tests.
6. Use a disposable remote repo/ticket and test credentials to validate integrations and approved push/PR separately.
7. Run Desktop focused security/validation tests and full type/build checks as a separate CI gate when shared policies change.

## Documentation after implementation

Update CLI introduction, install/Node requirements, auth/keyring, project selection and non-Git support, local boundaries, plan/ask/auto, commands and approvals, autonomous coding, PATH diagnosis/repair, toolchain setup, dependency installs, Git/GitHub, validation, servers/preview, integrations/MCP, Work Records, troubleshooting, command reference and known limits. Do not advertise PATH repair, arbitrary shells, all Desktop connectors, ticket-to-PR/deploy, or fresh-machine support until each is verified.
