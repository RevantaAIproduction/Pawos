# PawOS Documentation Audit

**Audit date:** 2026-11-06  
**Scope:** Repository documentation compared with the checked-in/current working-tree implementation for PawOS Desktop and PawOS CLI.  
**Mode:** Read-only audit. This report is the only file created or changed for this task.

## Executive summary

The repository has no useful root README (it is only `# Pawos`). User-facing information is split between a long CLI README and structured PawOS Web docs authored in TypeScript. The Web docs contain substantial Desktop guidance, but the Web repository README and some introductory copy contradict the actual existence of PawOS Web and the CLI. The CLI README describes a release-era command set and limitations; it is now stale relative to the local 1.2.1 candidate, which implements `/env`, connected GitHub/Linear tools, and `/work` Autonomous Work.

The local CLI candidate is **1.2.1**; the currently published npm package is **1.2.0**. The local 1.2.1 implementation previously passed its requested local test/build/package/install checks, but npm authentication returned 401 and it was not published. Production API compatibility for its newly added service-backed commands was not verified against the live service. Do not present those candidate-only commands as available to npm users until the release is published and the production endpoints are confirmed.

Desktop source is the repository-root Electron app (`package.json` name `companionos`, version `1.0.4`); a `companionos/` subdirectory is absent in this checkout. Source contains a broad set of runtime implementations, but this audit did not execute Desktop tests or production flows. The separate [Desktop MSIX verification report](PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md) is the release evidence: the existing 1.0.4 MSIX is unsigned, has no matching WACK report or verified source provenance, and is **not ready for Partner Center**. Do not describe it as a certified/current release.

## 1. Documentation inventory

### Canonical or potentially user-facing documentation

| Location | What it contains | Audit notes |
|---|---|---|
| `README.md` | 12-byte root README containing only `# Pawos` | Not an onboarding or product guide. |
| `pawos-cli/README.md` | npm install, sign-in, local project and GitHub workflows, commands, permissions/security, limitations, environment variables, development | Detailed and generally careful, but predates local candidate additions. Several command/capability statements now conflict with candidate source. |
| `pawos-web/src/lib/docs/content/` | Structured product docs rendered by the PawOS Web docs app; 89 pages across getting started, companion, coding, connectors, autonomous work, security, billing, concepts, troubleshooting, reference, mobile, and “four ways” | Main Desktop/product guide. Content lives in TypeScript, not Markdown. It has status callouts for partial/not implemented/not verified states, but several introduction/positioning claims conflict with the rest of this repo. |
| `pawos-web/README.md` | Web app developer/product README, tier/pricing summary, architecture and comparisons | Outdated positioning: says PawOS is “not a CLI tool” and includes old feature/price/runtime claims. |
| `pawos-vscode/README.md` | VS Code extension install/development and API contract | Describes a GitHub-backed thin client and correctly says it does not edit the VS Code folder. It needs version/availability context and should not be confused with the standalone CLI. |
| `pawos-shared/README.md` | Shared auth/API/task/Git modules used by CLI and VS Code | Internal developer documentation, not a customer capability guide. |
| `pawos-web/src/lib/docsContent.ts`, `pawos-web/src/lib/docs/registry.ts`, `src/shared/docs/` | Legacy/static docs and duplicated structured docs engine/types/rendering support | Document build infrastructure. Check parity tests when changing authored docs; do not treat the engine as product capability evidence. |

### Other repository documents

The root contains a large collection of audit, roadmap, test, release, design, implementation, and session reports (for example `PAWOS_CLI_CAPABILITY_AUDIT.md`, `PAWOS_CLI_IMPLEMENTATION_ROADMAP.md`, `PAWOS_FINAL_RELEASE_REPORT.md`, `PAWOS_DESKTOP_CLI_PARITY.md`, release checklists, phase reports, billing reviews, and security audits). These are internal historical artifacts, not a maintained customer manual. Some describe plans or older states. They should be labeled with date/status and excluded from capability claims unless rechecked against current code. More focused engineering docs also exist under `src/main/workspace/`, `src/renderer/conversation/extensions/`, `docs/`, and `supabase/audits/`.

## 2. Status definitions

- **Implemented and verified:** implementation is present and relevant local automated checks passed, or an exact package-level check was completed. This does not imply a production/live-service end-to-end check unless stated.
- **Implemented but not verified:** implementation/registration is present, but this audit did not run the corresponding Desktop or live integration flow.
- **Partially implemented:** a restricted subset works, or docs/source explicitly disclose an important missing link.
- **Planned:** appears in planning/docs/catalogue, but no complete implementation was located in the reviewed path.
- **Not implemented:** source or docs explicitly say it is absent, or the reviewed product has no implementation.
- **Published and available:** included in or confirmed as available from the published CLI 1.2.0 package. This status is separate from local 1.2.1 source.

## 3. PawOS CLI capability audit

### Installation, authentication, and service configuration

- The package is `@revantaai/pawos-cli`, with the shell executable `pawos`; it requires Node.js 20+. README installation is `npm install -g @revantaai/pawos-cli`. Shell commands include `pawos`, `pawos login`, `logout`, `status`, `version`, and `help`.
- Browser/device sign-in uses a one-time PawOS completion URL; credentials are stored via the system keyring where available, with a protected-file fallback. Shared implementation is in `pawos-cli/src/auth/` and `pawos-shared/src/auth/`.
- Production API default is `https://pawos.revantaai.com`. `PAWOS_API_URL` is an override validated by `pawos-shared/src/config.ts`; local development can point at another allowed PawOS endpoint. No provider/API secrets belong in CLI docs or examples.
- The standalone CLI does not have Desktop's direct local provider/MCP runtime. Account connections and entitlements are PawOS-account/server-side concerns.

### Local project work and security

- `pawos` supports local project folders that are not Git repositories; Git is optional for local work. It refuses to treat a drive root, home folder, or OS folder as a project. The user must start PawOS in the intended folder.
- Local operations include bounded list/read/search, file creation/edit/deletion, supported development commands, local Git operations, task resume, local server start/stop, localhost browser opening, and `/undo` for PawOS file changes. `/mode plan` is a no-change planning mode. `/mode ask` is the default; deletion and Git pushes always require explicit approval. Undo is file-only and is not a rollback of commands, commits, or pushes.
- Local path policy excludes secrets such as `.env`, Git internals, dependencies and build output; project boundaries and symlink traversal are constrained by `src/local/workspace.ts`, `filesystem.ts`, and the local tests. The command allowlist in `src/local/commandPolicy.ts` is limited to `npm`, `npx`, `node`, `git`, `python`/`python3`/`py`, `pip`/`pip3`, `yarn`, `pnpm`, `java`, and `javac`; commands are started as argv, not arbitrary shell scripts. Unsupported programs, shell chaining/pipes/redirection, and dangerous Git operations are refused. Approval rules still apply to installs/dependency changes and other non-routine commands.
- `src/local/checkpoint.ts` implements guarded per-task file recovery with size/count limits and conflict detection. It does not reverse external side effects.
- The full local CLI test run from the prior 1.2.1 release-validation turn passed **35 files / 1,342 tests**; typecheck/build and pack/install smoke checks also passed. Those were local candidate checks, not live production authentication or integration checks.

### Environment diagnostics

- Local candidate source implements **read-only** `/env [tool]` in `pawos-cli/src/commands/environment.ts` and `pawos-cli/src/local/environment.ts`.
- Supported names: `node`, `npm`, `git`, `python` (aliases `python3`, `py`), `java`, `javac`, `adb`, and `sdkmanager`. The command checks tool resolution, PATH duplicates and stale Windows shell resolution, plus Java/Android home variables; it does not modify PATH, install tools, or repair anything.
- The candidate's environment tests, including a real Windows snapshot and missing-executable behavior, passed in the prior validation. The published 1.2.0 archive does **not** contain the `/env` command. Do not say `/env` repairs PATH.

### Connected services and Autonomous Work

- The local candidate source implements `/tools`, `/github`, and `/linear` in `pawos-cli/src/commands/tools.ts`. The visible command subset reads GitHub repositories/issues/PRs/files and Linear issues/search; commenting is gated by a per-action confirmation. It calls `/api/web/tools`; it does not hold provider tokens or implement general MCP tool execution.
- The local candidate also implements `/work <ticket>` in `pawos-cli/src/commands/autonomous.ts` for supported GitHub/Linear tickets, with preview/authorization, local project execution, and completion/writeback steps. The API client is in `pawos-shared/src/api/pawosClient.ts`; corresponding local PawOS Web routes/tests are under `pawos-web/src/app/api/web/tools/` and `pawos-web/src/app/api/web/autonomous/`.
- These additions are present in the local 1.2.1 candidate package/source; unit/route tests are present and the full CLI suite passed. Live production endpoint deployment, account entitlements, connected-provider credentials, billing behavior, and end-to-end ticket execution were not independently verified. Treat these as **local-candidate implementation, not published/production availability**.
- No `/env`/environment repair, software installation management, arbitrary MCP action runner, or unrestricted shell capability exists in the CLI. Desktop-only integration breadth must not be attributed to CLI.

## 4. PawOS Desktop capability audit

The implementation is the Electron app at repository root: `package.json` calls it `companionos` and sets version `1.0.4`; source is primarily in `src/main`, `src/renderer`, `src/core`, and `src/shared`. This audit was read-only and did not run Desktop tests or live workflows, so source registrations below are **implemented but not independently runtime verified** here.

| Area | Source evidence and status | Documentation boundary |
|---|---|---|
| Companion experience | `src/core/runtime/CompanionPipelineManager.ts`, `src/renderer/companion/`, companion IPC/runtime and companion plugins. **Implemented but not verified.** | Custom companions/3D model requirements can be described; wake-word page itself labels the capability not verified. Avoid promise of a wake word. |
| Coding/task runtime | `src/main/execution/DesktopExecutionEngine.ts`, `CodingRuntimeSession`, execution plugins and `ConversationRuntime`. **Implemented but not verified.** | The Desktop is local execution environment; it is not equivalent to Web/CLI. |
| Planning/review | `ProposeExecutionPlanPlugin`, `ProposeCodeEditPlanPlugin`, `src/renderer/conversation/planReviewModel.ts`, `ProjectPlanCard`/task cards. Plan approval records intent; it does not waive subsequent mutation/command approvals. **Implemented but not verified.** | Keep distinction between plan approval and action authorization. |
| Developer environment and PATH | `SetPathEntryPlugin.ts`, `SetEnvironmentVariablePlugin.ts`, `RestorePathPlugin.ts`, environment/runtime requirement code and authorization. Machine-scope writes can request elevation; changes require confirmation. **Implemented but not verified in this audit.** | Desktop can repair PATH/set environment variables; CLI `/env` is read-only. Do not conflate the two. |
| Software management | `InstallToolPlugin.ts`, `VerifyToolInstalledPlugin.ts`, `UninstallSoftwarePlugin.ts`, `RepairSoftwarePlugin.ts`; verification and bounded repair paths. **Implemented but not verified in this audit.** | Installs/uninstalls/repairs are consequential and approval-gated. Do not imply every package manager/OS/package is supported; describe actual manager matrix only after checking `InstallToolPlugin` and current environment. |
| Validation and recovery | Syntax/import/typecheck/lint/build/test runners in `src/main/execution/validation/`; `RunValidationPipelinePlugin`; retry/recovery helpers. **Implemented but not verified in this audit.** | Missing project checks can be skipped; this is not a guarantee every change is correct. Automated visual checks are not part of the default pipeline. |
| Work Records/evidence | `src/shared/actions/WorkRecord.ts`, `WorkRecordTypes.ts`, `WorkRecordDetail.tsx`. **Implemented but partially complete.** Website docs acknowledge installs/PATH repair are only in the generic timeline, not structured evidence. | Explain evidence as recorded outputs/actions, not a guarantee that all effects are observable. |
| Browser/process | `DevBrowserManager.ts`, browser adapters/plugins, `ProcessManager.ts`, process start/stop/health/verification plugins. **Implemented but not verified.** Browser adapter support varies; source has explicit `NOT_IMPLEMENTED` responses for unsupported actions. | Distinguish PawOS-managed development preview from unrestricted browsing. Do not claim universal browser support or automatic visual verification. |
| Integrations/MCP | `DesktopExecutionEngine.ts` registers `ConnectorMcpPlugin`; infrastructure connectors and service-specific plugins exist. **Implemented but not verified per provider/account.** | Connector pages must name supported operations per service, consent/entitlement gates, and whether an action is read or write. “Integration exists” is not equal to every action being supported. |
| Ticket-to-change/writeback | `src/renderer/organization/AutonomousOrchestrator.ts`, autonomous billing/IPC, infrastructure ticket connectors and idempotent writeback helpers. **Partially implemented / not production-verified.** | Source supports ticket-driven work and selected writebacks/comments. Do not promise universal PR creation: the reviewed docs describe comments on an existing GitHub PR/GitLab MR for certain flows, not automatic PR creation for every tracker. |
| Speech provider catalogue | `src/renderer/conversation/SpeechProviderRegistry.ts` labels Azure and Deepgram STT, plus Azure/Kokoro/Piper TTS, as **planned**; browser/Gemini/Whisper STT and browser/ElevenLabs TTS are labelled available in the catalogue. | Do not advertise entries marked `planned` as working integrations. Catalogue status alone is not a live-provider test. |
| Desktop release | See `PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md`. **Not ready / not verified.** | Existing 1.0.4 MSIX is unsigned, lacks matching WACK and provenance, and predates current source changes. No store-ready claim. |

## 5. Capability matrix: product boundaries and publication

| Capability | Desktop source | Local CLI 1.2.1 candidate | Published CLI 1.2.0 | Classification |
|---|---|---|---|---|
| Chat/auth/account status | Shared account/API concepts, Desktop and CLI implementations | Core commands and device sign-in | **Published and available** core CLI package | Base workflow is shared; authentication UX differs. |
| Local non-Git project edits | Desktop workspace/coding runtime | Implemented; tests passed locally | **Published and available** in 1.2.0 package's existing local-work CLI | CLI is local and scoped to starting folder; do not confuse with remote GitHub edits. |
| Local commands, Git, checkpoints/undo | Desktop runtime/plugins | Implemented with CLI-specific allowlist/undo semantics; tests passed | **Published and available** in base CLI | Approval and recovery behavior differs; no cross-product parity claim. |
| Planning | Desktop visual structured plan review | `/mode plan` supports no-change planning | **Published and available** basic plan mode | Candidate's new ticket workflow is separate from normal plan mode. |
| `/env` diagnostics | Desktop has write-capable environment repair mechanisms | Read-only `/env` supported tools listed above; local tests passed | **Not implemented** in published 1.2.0 bundle | Candidate only; explicitly not PATH repair. |
| GitHub/Linear connected tools | Desktop connector/MCP/plugin surface | `/tools`, `/github`, `/linear`; source and local route tests exist | **Not implemented** as CLI slash commands in published 1.2.0 | Local candidate only, live service not checked. |
| Autonomous ticket work | Desktop orchestrator and billing workflow | `/work <ticket>` source exists in candidate | **Not implemented** in published 1.2.0 command bundle | Candidate only; do not market as available to current npm users. |
| Arbitrary MCP actions | Desktop `ConnectorMcpPlugin` | No generic MCP CLI executor | **Not implemented** | Desktop-specific. |
| Install software / repair PATH | Desktop only, confirmation/elevation protected | **Not implemented** | **Not implemented** | Never attribute Desktop's repair abilities to CLI. |
| Browser UI/process verification | Desktop managed browser/process tooling; support varies by adapter | CLI can start/stop local dev server and request opening local browser; it cannot inspect rendered page | **Not implemented** as Desktop-style verification | Desktop capability is selective and not a universal automatic test. |
| Ticket-to-PR | Desktop connector/autonomous writeback subset | Ticket work candidate; no universal PR creation claim | Not available as CLI feature | Describe issue work and connector-specific comments precisely; do not promise all ticket flows create PRs. |

**Published/local distinction:** The current npm latest is 1.2.0. The 1.2.1 candidate was locally built, tested (1,342 tests), packed, and installed for version/help smoke checks in the prior release-validation turn. `npm view` reported 1.2.0 latest; 1.2.1 returned 404; `npm whoami` returned 401. The candidate was not published. Live login and live API compatibility were not tested. Candidate `/env`, `/tools`, `/github`, `/linear`, and `/work` must not be presented as published 1.2.0 features.

## 6. Documentation inaccuracies, omissions, and claims to qualify

### Correct before broadening product claims

1. **Root README is empty in practice.** Replace it in a separately authorized docs update with a concise product overview, product boundaries, links to installation and each product guide, and current release status.
2. **Web README positioning is contradicted by the product.** `pawos-web/README.md` says “Why PawOS, Not CLI?” and “PawOS is not a CLI tool”; the same repo has `pawos-cli`, a published npm package, and Web docs for four ways to work. It also calls the app “Claude”/Anthropic-specific, says it works offline with sync, and lists old tier/pricing/runtime details. Revalidate each claim against current runtime/provider configuration and billing before retaining it.
3. **Web docs introduction contradicts actual Web and CLI surfaces.** `gettingStarted.ts` introduction says there is no PawOS Web app for everyday use and Desktop is the product; the same docs include Web use, CLI, `fourWays.ts`, and a Web app. Replace with product-neutral framing and a capability matrix.
4. **CLI README command table is incomplete for local candidate.** It omits `/tools`, `/github`, `/linear`, `/work` that current 1.2.1 source implements. Its “Not available from the CLI yet” section says service actions and Autonomous Work run only in Desktop; this is stale for local candidate source. Until deployment/publishing/live checks pass, explicitly label candidate-only commands and keep published 1.2.0 guidance separate.
5. **CLI release docs understate 1.2.1 changes.** `PAWOS_FINAL_RELEASE_REPORT.md` describes the candidate as prompt-history fix plus environment diagnostics. The actual packed candidate source also contains connected tools and `/work`; update the internal release record in a later documentation pass, with production API verification caveat.
6. **Desktop setup pages overstate current release readiness if read as a version claim.** Store installation instructions in `gettingStarted.ts` do not establish that the repository's 1.0.4 MSIX is store-ready. Add a clear product release/version note; refer to the verification report and do not imply the unsigned 1.0.4 file is a valid Store release.
7. **Path diagnostics are easy to conflate.** Website docs accurately describe Desktop write/repair capability; CLI `/env` is read-only. Put this distinction beside both instructions, including the candidate-only/published version boundary.
8. **“Visual verification” and “validation” need guardrails.** The website already says visual verification is on-demand, not in the pipeline; keep that disclosure prominent. `Build & Preview` wording about a “sandboxed browser” should be qualified to actual managed browser scope/adapter. A passing command/build is not proof of correct UI behavior.
9. **Connector and ticket wording needs operation-level detail.** Website docs cover many services; CLI candidate supports a narrower GitHub/Linear command set, while Desktop integrations vary by connector and plan. Do not imply every connector supports read/write, arbitrary MCP, autonomous runs, PR creation, or live production operation.
10. **Internal reports/plans are easy to mistake for current specification.** Add a status/date banner or archive index; plans, phase reports, and old release audits should not be indexed as current user instructions.

### Missing or weak documentation

- One current CLI feature matrix separating npm 1.2.0 from local/unpublished 1.2.1; exact new command syntax, auth/entitlement requirements, limitations and endpoint availability.
- A user-oriented CLI command reference that includes all actual local candidate slash commands, with read/write and confirmation behavior.
- Desktop release/version page separating source version, downloadable/Store availability, and artifact certification status.
- A concise Desktop security/approval guide mapping file changes, shell commands, installs, PATH/UAC, Git, connectors and deployment approvals.
- A verified support matrix for OS, developer tools/package managers, browsers, integrations and ticket writeback operations.
- A failure/recovery table: what retry repairs, what `/undo` or Desktop recovery restores, and which external effects cannot be rolled back.
- Explicit labels for live-verified vs code/test-backed vs planned/unverified capabilities.

## 7. Recommended documentation structure

1. **Root README:** neutral PawOS overview; current products/releases; quick links; status date.
2. **Product chooser / parity page:** one row per Web, Desktop, CLI, VS Code, Mobile; mark where work executes and what it can see/change.
3. **PawOS CLI guide:** install, requirements, sign-in, shell command reference, local project security, GitHub/Linear tool commands, `/work`, `/env`, account config, troubleshooting; separate published stable version from preview candidate.
4. **PawOS Desktop guide:** installation/version status, first run/companion, workspace, coding/planning, approvals/security, diagnostics/repair/install, validation/recovery, Work Records, browser/process tools, integrations and ticket workflows, limitations.
5. **Reference pages:** supported provider/operation matrix, command allowlists, OS/package manager/browser support, environment variables, errors and exit codes.
6. **Developer docs:** API contracts, source/build/test, release provenance/certification workflows, tests and architecture. Keep internal audits/plans out of customer navigation.
7. **Capability status convention:** each feature explicitly marked available in a named product/version, locally implemented, verified in what test environment, or planned/unverified.

## 8. Prioritized documentation update plan

| Priority | Update | Gate/evidence needed |
|---|---|---|
| P0 | Correct root README, Web README and Web introduction so product positioning matches Web, Desktop and CLI reality. | Confirm current product direction and recheck prices/provider/offline claims. |
| P0 | Split CLI stable 1.2.0 docs from candidate 1.2.1 docs; correct stale unsupported-feature table and document exact `/env`, `/tools`, `/github`, `/linear`, `/work` behavior only in candidate/preview section. | Publish 1.2.1 and verify registry/package plus live production API, or keep these commands explicitly unpublished/preview. |
| P0 | Add Desktop 1.0.4 release-state disclosure; link the verification report internally and avoid Store-ready claims. | New authorized build, publisher signature, exact-file WACK, provenance and disposable VM test before announcing release. |
| P1 | Write Desktop security/permissions, software installation/PATH repair, validation/recovery, Work Record, browser/process, and integration operation guides. | Trace each statement to current plugin and test; mark untested integrations/OS paths. |
| P1 | Replace broad CLI-vs-Desktop marketing table with capability-by-capability matrix. | Maintain independent Desktop, local CLI and published CLI columns. |
| P2 | Inventory stale root audit/plan documents; add date/status and archive/non-canonical labels. | Owner review of historical artifacts; do not delete without separate authorization. |
| P2 | Add doc integrity checks for commands, package version boundaries, broken links and implementation status callouts. | Integrate into docs tests only after scope approval. |

## 9. Do not advertise yet

- PawOS Desktop 1.0.4 MSIX as signed, WACK-passing, source-reproducible, install-tested, or ready for Partner Center.
- CLI 1.2.1 as published or generally available on npm.
- Candidate `/env` as an environment repair tool; it is read-only.
- Candidate `/tools`, `/github`, `/linear`, or `/work` as production-available until published and live API/integration behavior is independently verified.
- CLI arbitrary MCP actions, Desktop software installation/PATH repair, broad connector parity, or Desktop visual/browser/process features as CLI capabilities.
- Automatic visual regression detection as part of default coding validation.
- Universal ticket-to-PR creation; the source/docs indicate connector-specific ticket work/writeback and comments, not a guaranteed PR for every run.
- Wake-word support as available; the product docs mark it unverified.
- “Works offline,” fixed pricing/tier limits, “Claude-only,” all-platform Desktop support, or any Store version claim without fresh source/production evidence.

## 10. Evidence index

### CLI

- `pawos-cli/package.json`, `pawos-cli/package-lock.json` — candidate package name/version/bin/files/Node requirement.
- `pawos-cli/src/cli.ts`, `pawos-cli/src/commands/interactive.ts` — shell commands and interactive slash-command routing.
- `pawos-cli/src/config.ts`, `pawos-shared/src/config.ts`, `pawos-shared/src/auth/` — production API default, override validation, authentication.
- `pawos-cli/src/local/workspace.ts`, `filesystem.ts`, `commandPolicy.ts`, `commands.ts`, `gitChanges.ts`, `checkpoint.ts`, `agent.ts` — workspace boundaries, protected files, argv command policy, undo, local agent.
- `pawos-cli/src/commands/environment.ts`, `pawos-cli/src/local/environment.ts`, `environment.test.ts` — `/env` supported tools and read-only diagnostic behavior.
- `pawos-cli/src/commands/tools.ts`, `autonomous.ts`; `pawos-shared/src/api/pawosClient.ts`; local API implementations/tests under `pawos-web/src/app/api/web/tools/` and `pawos-web/src/app/api/web/autonomous/` — candidate connected tools and ticket work.
- `pawos-cli/README.md` — current command docs and the stale “not available” statements.
- Published-vs-candidate package records: prior release verification (`PAWOS_FINAL_RELEASE_REPORT.md`) and exact published 1.2.0 tarball review in the preceding validation turn. Registry said 1.2.0 latest; 1.2.1 404; npm identity check 401.

### Desktop

- `package.json`, `electron-builder.yml`, `src/main/`, `src/renderer/`, `src/core/`, `src/shared/` — actual Electron Desktop implementation and release identity.
- `src/main/execution/DesktopExecutionEngine.ts`, `RuntimeActionAuthorization.ts`, `CodingRuntimeSecurity.ts`, `plugins/` — runtime registration, authorization and concrete actions.
- `src/main/execution/plugins/InstallToolPlugin.ts`, `SetPathEntryPlugin.ts`, `SetEnvironmentVariablePlugin.ts`, `RestorePathPlugin.ts`, `RepairSoftwarePlugin.ts` — install/repair/environment support.
- `src/main/execution/validation/`, `ProcessManager.ts`, `DevBrowserManager.ts`, `src/shared/actions/WorkRecord.ts`, `src/renderer/organization/AutonomousOrchestrator.ts` — validation, process/browser, records and autonomous workflow evidence.
- `src/main/execution/plugins/infrastructure/ConnectorMcpPlugin.ts` plus service-specific connector plugins — Desktop connected tool/MCP path.
- `pawos-web/src/lib/docs/content/` and `pawos-web/src/lib/docs/registry.ts` — structured user-facing product docs and their status disclosures.
- `pawos-web/README.md`, `pawos-cli/README.md`, `README.md` — docs needing product-boundary corrections.
- `PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md` — exact MSIX hash, unsigned status, absent matching WACK/provenance, old WACK failure, and unrun clean installation/runtime checks.

## Recommendation for the next step

Authorize a **documentation-only P0 update** beginning with the root/Web product positioning and a two-column CLI version boundary (published 1.2.0 vs unpublished local 1.2.1). Keep Desktop 1.0.4 explicitly not certified until a new, signed, provenance-linked package passes exact-file WACK and disposable-environment tests.
