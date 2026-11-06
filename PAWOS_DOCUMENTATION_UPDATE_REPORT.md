# PawOS Documentation Update Report

Date: 2026-11-06

## Scope

Updated authored documentation to align product descriptions with repository evidence. No source behavior, package version, configuration, generated build output, release artifact, npm publication, or Store submission was changed.

## Files updated

- `README.md` — replaced the placeholder with a repository overview, distinguishing Desktop, Web, and independently installed CLI; documents Node.js requirement and published/candidate CLI status.
- `pawos-web/README.md` — replaced outdated product positioning with Web-specific scope, repository structure, development commands, and caveats around provider, pricing, entitlements, offline behavior, and runtime counts.
- `pawos-cli/README.md` — separated published 1.2.0 from local unpublished 1.2.1 candidate; documented candidate `/env`, `/tools`, `/github`, `/linear`, `/work` behavior without implying those commands are in npm 1.2.0; retained the CLI security and usage guidance.
- `pawos-web/src/lib/docs/content/gettingStarted.ts` — clarified product boundaries, standalone local CLI behavior, published-versus-candidate commands, and the Desktop MSIX certification limitation.
- `pawos-web/src/lib/docs/content/fourWays.ts` — reframed the comparison around Web, Desktop, and CLI, with a factual capability matrix and mobile access paths.
- `pawos-web/src/lib/docs/content/coding.ts` — marked Desktop capabilities as source-present but not runtime-verified where appropriate; added the Desktop Capability and Release Status page.
- `pawos-web/src/lib/docs/content/billing.ts` — removed fixed plan prices, allowance/credit thresholds, and unsupported offline promises; directs readers to current account billing and usage screens.
- `pawos-web/src/lib/docs/content/autonomousWork.ts` — removed fixed ticket rates and top-up minimum/expiry promises; directs users to the current displayed charging terms.
- `pawos-web/src/lib/docs/navigation.ts` — added the Desktop capability status page to navigation.
- `pawos-web/src/lib/docs/disclosure.ts` — excluded product-comparison pages from a generic Desktop-focused appendix that conflicted with their content.

## Corrected product and release claims

- PawOS Web is a browser experience for chats and supported GitHub-connected repository work. Its documentation no longer implies it can execute commands against the user's local project.
- PawOS CLI is independently installed and runs local project work from the current folder; non-Git folders are supported for local work. The documentation clarifies that sign-in may use a browser handoff and that Web/Desktop installation is not a prerequisite.
- Published npm CLI is **1.2.0**. Local **1.2.1** is an unpublished candidate. `/env [tool]` is described as read-only and supports `node`, `npm`, `git`, `python` (`python3`/`py` aliases), `java`, `javac`, `adb`, and `sdkmanager`. No PATH repair capability is claimed for the CLI.
- Desktop documentation is framed as source-backed, not runtime verified, where this audit did not exercise the behavior. It distinguishes Desktop environment repair/software management from CLI diagnostics.
- The existing Desktop **1.0.4** MSIX is documented as unsigned, without a matching WACK report or verified source provenance, and without disposable installation/runtime test evidence. It is not described as Partner Center-ready or as equivalent to current Desktop source.
- Fixed prices, tier allowances, credit minimums/rates, and offline capability promises were removed from authored billing/product comparisons where they were not independently verified as current. Readers are directed to live billing screens.
- Provider/model availability and runtime counts are not promised as fixed in the Web README. No provider-specific or offline guarantee was introduced.

## Verified versions and commands

- Repository source/package metadata identifies the local CLI candidate as **1.2.1**; the supplied prior validation record says its local tests/build/package checks passed. This update did not rerun the CLI release suite.
- The supplied audit context records npm **1.2.0** as published and 1.2.1 as unpublished after npm authentication returned 401. No publication was attempted in this task.
- Desktop source package version is **1.0.4**. The supplied verification report identifies `dist/PawOS-1.0.4-x64.msix` and records unsigned status, no matching WACK report, and no source-to-package provenance. No package was changed or retested here.
- Documented install command remains `npm install -g @revantaai/pawos-cli`; CLI requires Node.js 20 or newer. No `npm publish` command was run.

## Validation

- Documentation engine/parity tests: **2 files passed, 31 tests passed** using `vitest run src/lib/docs/engine/docsEngine.test.ts src/lib/docs/engine/parity.test.ts` from `pawos-web`.
- `git diff --check` on the documentation changes: **exit code 0**, no whitespace errors. Git emitted line-ending normalization warnings only.
- A targeted search of authored product documentation found no hard-coded `$`/`₹` price figures, no model/provider names presented as a fixed catalogue, no fixed runtime count, and no affirmative offline-mode claim. The remaining offline references explicitly say behavior is unverified.
- A full web build was not run because it generates build artifacts, outside this documentation-only scope. CLI tests and live service/API behavior were not rerun.

## Gaps and claims not to advertise yet

- Do not advertise the local CLI 1.2.1 candidate as available from npm. Its service-backed candidate commands were not live-verified against production in this update.
- Do not advertise CLI PATH repair, software installation, general MCP execution, or Desktop-only workflows as CLI capabilities.
- Do not claim the Desktop 1.0.4 MSIX is signed, WACK-certified, source-equivalent, install-tested, or ready for Partner Center. No installation or launch test was run.
- Desktop source presence alone does not establish successful runtime behavior for PATH repair, package installation, recovery, browser verification, integrations, or ticket-to-PR flows. These remain caveated in the capability page.
- Current provider/model catalogue, regional prices, plan limits, ticket rates, and offline behavior require live account/product verification before documentation promises them.

## Recommended next step

Review the updated public-facing pages, then publish the documentation update. Separately, perform production-backed CLI/API verification and a signed, provenance-tracked Desktop packaging/WACK/install validation before making release or certification claims.
