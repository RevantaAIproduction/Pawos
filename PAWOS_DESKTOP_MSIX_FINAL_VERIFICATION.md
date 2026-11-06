# PawOS Desktop 1.0.4 — Final MSIX Verification

**Decision: NOT READY FOR PARTNER CENTER.** The existing package is unsigned, the saved WACK reports are for older builds and contain a failed check, and this exact package has not passed WACK or disposable-environment runtime testing. No rebuild, installation, or submission was performed.

## Artifact inspected

- **Path:** `C:\Users\APPLE\Downloads\PawOS\dist\PawOS-1.0.4-x64.msix`
- **Size:** 306,867,005 bytes
- **Modified:** 2026-10-14 04:45:51 UTC
- **SHA-256:** `E63239D4F6430759CF0039E2312045829BDA97C520847D27C96CB9664A20754E`
- Existing artifact was only read and unpacked to a temporary inspection directory. It was not renamed, replaced, or deleted.

## Package identity, manifest, and signature

The embedded `AppxManifest.xml` was read from this exact MSIX. `MakeAppx unpack` completed, and the manifest declares:

| Field | Embedded value |
|---|---|
| Identity name | `PawosAI.PawOS` |
| Publisher string | `CN=3749BDE7-E3A7-4F62-A2E7-33B2A93F803E` |
| Package version | `1.0.4.0` |
| Processor architecture | `x64` |
| Application ID | `PawOS` |
| Executable / entry point | `app\PawOS.exe` / `Windows.FullTrustApplication` |

The identity name and publisher string match the current root `electron-builder.yml` MSIX configuration. **The publisher certificate identity is not cryptographically verified**, because this package has no `AppxSignature.p7x` entry.

**Signature verification failed.** `signtool verify /pa /v` exited 1 with “No signature found.” PowerShell `Get-AuthenticodeSignature` likewise returned `NotSigned`. An unsigned MSIX cannot be treated as a verified Store submission artifact.

## Source version and package comparison

The supplied `companionos` subdirectory does not exist in this checkout. The repository root is the Desktop app source: its `package.json` has name `companionos`, version `1.0.4`; its `electron-builder.yml` defines the matching MSIX identity. The source package version therefore matches the MSIX manifest version at `1.0.4.0`.

Version agreement does not establish binary provenance. No build record, source commit identifier, reproducible-build record, or signed provenance tying this MSIX to a particular source revision was found. The MSIX is dated October 14, while current Desktop source files include later modifications dated October 19. The working tree contains uncommitted Desktop changes, including changes in `CodingRuntimeSecurity.ts`, `DesktopExecutionEngine.ts`, `CodeChangeLedger.ts`, `IntentRegistry.ts`, `capabilityGroups.ts`, `ConversationPanel.tsx`, `confirmationPrompt.ts`, `systemPromptModules.ts`, and `ActionTypes.ts`. These changes include project documentation planning/writing action support. Their later source timestamps and diffs establish that the October 14 package cannot contain those later edits. The MSIX's embedded `app.asar` is not demonstrated to match the current source build.

**Conclusion:** this artifact is not equivalent to the current Desktop source. Source-to-binary provenance is unverified, and the known post-artifact source edits are absent. A new build will be necessary after the source changes are finalized and authorized for release.

## WACK and certification

No WACK report for version 1.0.4 was found. The reports in `dist` are for earlier packages:

- `wack-report-1.0.3-20261011-173148.xml`: 24 checks, 23 passed, 1 failed.
- `wack-report.xml`: 24 checks, 23 passed, 1 failed.

The 1.0.3 report's failed check is **Blocked executables**. It identifies process-launch API references and blocked-executable string matches in packaged binaries/resources. These reports do not certify the 1.0.4 MSIX and their failure must be resolved or assessed against a fresh WACK run.

WACK was **not run against the exact 1.0.4 MSIX**. The installed `appcert.exe` requires elevation to start. Its WACK test flow can install/launch the package, and this machine is not a disposable Windows test environment. Running it here would not meet the requested isolation condition. No WACK result is claimed for this artifact.

## Installation and runtime testing

No PawOS package was found installed by the current user's `Get-AppxPackage` query. The package was not installed: there is no disposable Windows VM/sandbox available in this session, and the package is unsigned. Consequently, these requested checks remain **not run**:

- MSIX installation and package identity/version as installed
- application launch and startup-crash monitoring
- login
- companion startup
- core agent execution
- local project access
- integrations

## Final assessment and release blockers

**Do not reuse or submit this MSIX to Partner Center.** The exact file has a validly readable manifest and matching declared version/identity/architecture, but is unsigned, has no 1.0.4 WACK report, lacks build provenance, and predates known current source changes. The saved 1.0.3 WACK report also has one failed check.

**Rebuilding is necessary** to include the current approved Desktop source. Preserve this existing MSIX as-is. After release scope is finalized, build a new MSIX, sign it with the authorized Store publisher identity, verify the signature and manifest, run WACK against that exact signed file, and conduct install/launch/login/core-functionality smoke tests in a disposable Windows environment. Reconcile any WACK failures before considering Partner Center submission. No submission was made.
