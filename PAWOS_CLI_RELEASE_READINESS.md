# PawOS CLI Release Readiness

**Audit date:** 2026-11-05  
**Verdict: NEEDS FIXES**

The CLI has substantial local-agent functionality, but two prompt-history tests fail reproducibly. Clean Windows packaging/install and live account/API workflows were not verified. No code release, hosting or production modification was performed; package version was not changed.

## Readiness

| Area | Evidence / status |
|---|---|
| CLI version | `@revantaai/pawos-cli` is 1.2.0 in package.json, lockfile root and config version source. Desktop is separately `companionos` 1.0.4. No Git tags were listed. |
| Release artifact | `pawos-cli/revantaai-pawos-cli-1.1.0.tgz` filename is stale relative to source metadata 1.2.0. Create a fresh artifact only during release preparation. |
| Package metadata | `pawos` bin targets `dist/pawos.js`; package includes dist/README, Node >=20, npm public access and prepack build script. **npm pack contents not verified.** |
| Startup/help/version | `node pawos-cli/dist/pawos.js --help` and `--version` both succeeded and printed v1.2.0. **VERIFIED.** |
| CLI tests | Full direct Vitest run: 33/34 files passed; 1,335 passed, 2 failed. Isolated `src/ui/prompter.test.ts`: 24 passed, the same 2 Up-arrow history tests failed. **Reproducible blocker.** |
| Local execution | Test harness used disposable Git/non-Git projects and real Node/npm/Git/process execution; file edits/undo, builds/tests, approval and denial, and server start/stop passed. **VERIFIED by automated harness, not live account.** |
| Build/typecheck | CLI package scripts were invoked but individual exit output was not reliably captured; a direct multi-project check was interrupted. **NOT VERIFIED.** |
| Authentication/backend | No live PawOS account/API task or provider connection tested. **NOT VERIFIED.** |
| Credential handling | Source uses OS keyring where available and fallback outside project; access token memory-only and provider credentials stay server-side. Source/test evidence exists; clean-machine keyring fallback **NOT VERIFIED**. |
| Windows compatibility | Windows-specific path, keyring and process-tree code exists; suite ran on Windows. Fresh install and native credential storage on a clean host **NOT VERIFIED**. |
| API configuration | `PAWOS_API_URL` override and shared authenticated client are implemented; production compatibility not tested live. |
| Distribution/docs | npm public package metadata and CLI README exist. No CLI publish workflow was found in inspected workflow list. README needs final feature/limit cross-check. **PARTIAL.** |
| Security | Path/symlink boundaries, secrets exclusions, command allowlist/argv, confirmations, Git push gate, bounded output/time, env redaction, process termination and checkpoints are implemented. This was source review, not penetration testing. |
| PATH/registry/UAC | CLI does not implement environment repair; Desktop does. No system PATH, registry or production infrastructure was changed. |

## Release blockers

### P1: prompt history

Both history restoration cases in `src/ui/prompter.test.ts` fail when Up-arrow should restore the submitted message. They fail again in isolation. Fix while preserving typed-ahead behavior and approval input isolation, then rerun the complete suite.

### P1: clean package and Windows install evidence

The package source is 1.2.0, while the existing tarball is named 1.1.0. Deterministic build/typecheck, npm pack contents, clean install, Node 20+ launch, and credential-store fallback have not all been verified. Do not publish from this audit.

### P1: live workflow evidence

Use a non-production PawOS account and disposable GitHub/Linear resources to test auth, API task execution, provider permission checks and ticket workflow. Source implementation alone does not establish successful end-to-end behavior.

## Recommendation

**NEEDS FIXES.** Resolve prompt-history failures, capture build/typecheck and clean-package evidence, and verify a controlled live account workflow plus Windows keyring fallback before release. PATH repair and Desktop software lifecycle are parity roadmap work, not current CLI features. Nothing was published, uploaded, hosted or deployed.
