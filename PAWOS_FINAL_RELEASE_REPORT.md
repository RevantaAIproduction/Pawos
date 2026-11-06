# PawOS Final Release Report

**Inspection date:** 2026-11-06  
**Repository layout:** CLI source/package at `pawos-cli`; Desktop package/source at the PawOS repository root; Desktop artifacts in root-level `dist`. No existing build or release artifact was moved, overwritten, or deleted. After comparison, one missing 1.0.4 MSIX was copied into root `dist` as a candidate; the external original remains untouched.

## Executive status

- **CLI:** current npm version is 1.2.0. A 1.2.1 candidate has been prepared, tested, built, packed, and installed in a temporary prefix. It is **not published**. npm authentication check returned E401, and registry lookup confirms 1.2.1 is absent.
- **Desktop:** source package version is 1.0.4. A checked copy of the external 1.0.4.0 MSIX is now in root `dist`; it has no WACK report and source equivalence to the current, later main worktree is not established. Treat it as a candidate, not a release-ready build. The older 1.0.3 package must not be submitted as the current-source release.
- **Microsoft Store:** no submission was made. The repository’s `desktop-msix.yml` workflow builds, runs WACK, and uploads a GitHub Actions artifact; it does not submit to Partner Center. A current-source package and current WACK report are still needed.

## 1. Repository layout and provenance

The actual repository has no `companionos` subdirectory. The Desktop `package.json` is at `C:\Users\APPLE\Downloads\PawOS\package.json` (`name: companionos`, `productName: PawOS`, `version: 1.0.4`) and the Desktop source is under the repository-root `src` directory. The requested `C:\Users\APPLE\Downloads\PawOS\companionos` path does not exist.

The existing Desktop builds are under `C:\Users\APPLE\Downloads\PawOS\dist`. Before consolidation, the newest ordinary MSIX there was `PawOS-1.0.3-x64.msix`, modified 2026-10-11. A byte-identical archival copy is in `dist\release-1.0.3-original`. After inspection, `PawOS-1.0.4-x64.msix` was copied from the separate release folder into this existing `dist` directory without overwriting any file.

The release history identifies commit `bfc02a8` (“Release Desktop 1.0.3”, 2026-10-11) and then `a043a86` (“Release Desktop 1.0.4”, 2026-10-14). The separate `PawOS-release-1.0.4` folder is clean at `a043a86`; the current repository is at descendant `d9b8f95` (2026-10-16) and has additional uncommitted Desktop changes. Both Desktop package manifests say 1.0.4, but the current main source includes later changes than the external build baseline.

The MSIX build metadata maps files from the root repository’s `dist\win-unpacked` into the MSIX. It does not record a source commit or source hash. The 1.0.3 WACK report records package identity/version but not the tested MSIX hash. These records support identification of the build, but do not prove byte-for-byte source-to-binary equivalence.

## 2. Desktop artifacts

All package hashes below are SHA-256. Byte counts and UTC modification times are from the filesystem inventory.

| Artifact | Size (bytes) | Modified (UTC) | SHA-256 | Finding |
|---|---:|---|---|---|
| `dist\PawOS-1.0.0-x64.msix` | 307,041,250 | 2026-10-01 11:34 | `819732bfb35852adcd4e22b05ef0895d162bbfa4ad0c34ba3fd32e3ce59891c7` | Unsigned, x64, identity 1.0.0.0 |
| `dist\PawOS-1.0.1-x64.msix` | 298,634,765 | 2026-10-04 08:06 | `3163a4fe8e444583219b912f45f009d86c29e5080881f94b6e5e7c4d1b056e7c` | Unsigned, x64, identity 1.0.1.0 |
| `dist\PawOS-1.0.2-x64.msix` | 307,137,697 | 2026-10-05 08:01 | `c2601c53046f2514eae10fd6207e5b98e8564e2bd6e10da40b9a54d751483ac6` | Unsigned, x64, identity 1.0.2.0 |
| `dist\PawOS-1.0.3-x64.msix` | 307,140,870 | 2026-10-11 10:46 | `60cca9d4d69667e7575eebaf97e64ce52d42168e04b43d7be17d181ca683e533` | Newest ordinary release-named package; unsigned |
| `dist\release-1.0.3-original\PawOS-1.0.3-x64.msix` | 307,140,870 | 2026-10-11 10:46 | `60cca9d4d69667e7575eebaf97e64ce52d42168e04b43d7be17d181ca683e533` | Exact duplicate of the ordinary 1.0.3 package |
| `dist\PawOS-1.0.3-x64.jumpfix-test.msix` | 307,141,244 | 2026-10-12 10:32 | `963495792cba6f158a2144c928f9da45faccecfd347b62ac6296f32cd57b6d52` | Test-named package, not a release artifact; signature verifies with test certificate |
| `dist\test-signed\PawOS-1.0.3-x64.test-signed.msix` | 307,140,879 | 2026-10-11 12:47 | `3eb70144fce4d6f0f391ecf46519d62b297ceeb3c1136dc6b2f40dd119f8d72d` | Test-signed package, not a Store submission artifact |
| `dist\PawOS-1.0.4-x64.msix` | 306,867,005 | 2026-10-14 04:45 | `E63239D4F6430759CF0039E2312045829BDA97C520847D27C96CB9664A20754E` | Copied from release folder after comparison; unsigned candidate; no WACK report |

No MSIXBundle, APPX, or APPXBundle files were found in root `dist` or the external 1.0.4 release folder.

Each package is a readable ZIP container and passed ZIP CRC checks. The ordinary 1.0.3 manifest reports:

- Package identity: `PawosAI.PawOS`
- Version: `1.0.3.0`
- Publisher: `CN=3749BDE7-E3A7-4F62-A2E7-33B2A93F803E`
- Processor architecture: `x64`
- Target: `Windows.Desktop`, minimum `10.0.17763.0`

The manifest’s `PublisherDisplayName` is `PawosAI`; the application display name is `PawOS`.

For the newest ordinary 1.0.3 package, `AppxManifest.xml` SHA-256 is `7fb43e54c4065dd5002987fac5900a787a3c2182010cfa8d5d5fb35517d93fd0` and `AppxBlockMap.xml` SHA-256 is `666322d078c427f2bc932edceec0bca655414517ef8f58de31d0364ed905bdc2`.

The copied 1.0.4 package manifest identifies `PawosAI.PawOS`, version `1.0.4.0`, publisher `CN=3749BDE7-E3A7-4F62-A2E7-33B2A93F803E`, and x64 architecture. Its container CRC check passed; it has no `AppxSignature.p7x`, as expected by the repository’s Store workflow. Its `AppxManifest.xml` SHA-256 is `a002cfde30ed2d4e58d9e3f7819c9d8c06179745759f94f97efc30fc10a12b5d` and `AppxBlockMap.xml` SHA-256 is `7f299f3080374b17734e2ae1777fc00119098859074f6ae3b5edfac9c125d01b`. Source and copied-file SHA-256 values matched exactly.

### Signature results

`SignTool verify /pa /v` returned “No signature found” (exit 1) for the ordinary 1.0.0, 1.0.1, 1.0.2, and 1.0.3 MSIX files. The repository workflow states Store packages are unsigned and Microsoft signs them on Store upload.

The copied 1.0.4 package also has no embedded signature; SignTool reports no signature. This matches the workflow’s unsigned Store-package model but does not make it install-ready for local sideloading.

SignTool verified both test-named 1.0.3 files (exit 0). The test-signed package uses a self-issued certificate with subject/issuer `3749BDE7-E3A7-4F62-A2E7-33B2A93F803E`; it is not timestamped. These test signatures are not evidence of a Microsoft Store signature or production trust.

### WACK reports

| Report | Package recorded | Result | Checks |
|---|---|---|---|
| `dist\wack-report.xml` (SHA-256 `37a5e3ec60e8b85f78d0d2fa59769b61c861e30e42a429426d7490beb0606004`) | `PawosAI.PawOS` 1.0.2.0 | Overall **PASS** | 23 PASS, 1 optional `Blocked executables` FAIL |
| `dist\wack-report-1.0.3-20261011-173148.xml` (SHA-256 `3acc062b79895ffc4db6ed139c6290f7d857e6ca144b380fbe883e393f1fef73`) | `PawosAI.PawOS` 1.0.3.0 | Overall **PASS** | 23 PASS, 1 optional `Blocked executables` FAIL |

The 1.0.3 report is dated 2026-10-11 and is consistent with the ordinary 1.0.3 package, but it does not identify that package by hash. There is no WACK report for Desktop source version 1.0.4.

### Other Desktop build outputs and metadata

- Unpacked/intermediate directories include `dist\main`, `dist\preload`, `dist\renderer`, `dist\win-unpacked`, `dist\msix-test`, `dist\test-signed`, and `dist\release-1.0.3-original`. Both inspected app executables report FileVersion 1.0.3 / ProductVersion 1.0.3.0. `dist\win-unpacked\PawOS.exe` is 204,857,856 bytes (SHA-256 `73ca337504af1e1fdd9cf086df8f13b77d9bae1eedc687c60f28e9c69f08d322`). `dist\msix-test\app\PawOS.exe` is 204,857,856 bytes (SHA-256 `c7679c7428b9607b24d5fd395789e1964834d9a5283d3fb4f171b67a6b8dd06e`).
- Older setup installers: `PawOS-Setup-0.1.1.exe` (222,758,879 bytes; SHA-256 `69096745b9bc2aa4917ddbc11376c9dfc16765e29302a0e5969dc7aa9112bd0a`) and `PawOS-Setup-1.0.0.exe` (231,423,020 bytes; SHA-256 `e8d1d0409318d5dd2c1f60a186e403da911749de8289f856296488283f5af0a3`). These are not current MSIX packages.
- Setup blockmaps: 0.1.1 SHA-256 `b2af8a5b0d7a80aec825b9b7026728ac42fbcd130ca38cd43377070ad6822b9d`; 1.0.0 SHA-256 `12ce3ee74a2845c3b6dd2ef5e5dae17c05d095c3977cdc3ce81172b505175fad`.
- `dist\builder-debug.yml` (18,864 bytes; SHA-256 `c5fbaccfbb55a9eb271669295ce550548f4a9eb7b08c7a5963fd954b88b0ec99`) was modified 2026-10-12 and maps the root `dist\win-unpacked` contents into the package.
- `dist\builder-effective-config.yaml` (1,235 bytes; SHA-256 `75fa57eb81e856c155926079f3573016499c1524eef12a1486bfb572613b378d`) and `dist\latest.yml` (339 bytes; SHA-256 `5ba3f567fe2bf76e525cdc4bf3b56af9cc3d2bc2fa5d80b3940f97429a757c7f`) are older build metadata.
- `package.json` SHA-256: `0f4e37e7a4c71c8117158d5c785c667a8deb076502ad12a37240bba1c44a7c1e`; `electron-builder.yml` SHA-256: `e6407c053b78a9a7e3f35d66588a29fee0e191042ddbbb43d25f146b30c55847`; MSIX workflow SHA-256: `af6a82a8feba19b28114fc3f642969c203e9f071ad0368f149ce7582e7d4a7eb`.

## 3. Comparison with `PawOS-release-1.0.4`

The external folder is a separate clean checkout at Desktop commit `a043a86`; its package versions are Desktop 1.0.4 and CLI 1.2.0. It is not a newer CLI version than the published 1.2.0, and it is older than the current main CLI candidate 1.2.1.

| Area | External release folder | Current PawOS tree | Result |
|---|---|---|---|
| CLI | 1.2.0; README says Autonomous Work is unavailable; no `/env` command or environment diagnostics found | 1.2.1 source with `/work`, read-only `/env`, prompt-history fixes, and implementation tests | Do not copy external CLI files; current PawOS already contains the newer implementation. |
| Desktop source | 1.0.4 at `a043a86`; contains environment writers/refresh/version checks, software install/update/repair/detect/uninstall plugins, unified validation, Work Records, ticket investigation, and GitHub PR modules | Same capability families exist in root source, plus later committed and uncommitted Desktop changes after `a043a86` | Do not copy the older external source over the current root source. |
| Desktop package | 1.0.4.0 x64 MSIX; ZIP CRC valid; unsigned; no WACK report found | Root `dist` lacked this artifact before this check | Copied without overwrite to `PawOS\dist\PawOS-1.0.4-x64.msix` as a candidate. |

The external Desktop source meets the capability categories inspected, but that alone does not prove the copied binary contains every source change. The external builder metadata points to the release folder and contains no source commit/hash; the main source has later changes. The copied package has no WACK evidence. It is present for continuity, not approved for Store submission.

## 4. Desktop release decision

**Rebuilding is necessary** to release the current Desktop source. The 1.0.3 package is older than source. The copied 1.0.4 MSIX is from the external `a043a86` release baseline, does not have a matching WACK report, and cannot be proven equivalent to the later main worktree. The 1.0.3 WACK report is historical evidence, not certification for either the copied 1.0.4 package or current source.

No installation, launch, login, or functional smoke test was run. This computer already has `PawosAI.PawOS` 1.0.3.0 installed, and a disposable Windows VM was not available. I did not install over the existing application. No build was run into root `dist`, because the existing unpacked builds and reports must be preserved.

The existing `.github/workflows/desktop-msix.yml` is a manual GitHub Actions build/certification workflow. It runs typecheck/build, makes an unsigned MSIX, attempts WACK, and uploads the package/report as an Actions artifact. It contains no Partner Center submission step. The workflow can only build the committed checkout; the current Desktop worktree also has local changes. Therefore the existing package is **not ready for submission**, and no Partner Center submission occurred.

## 5. CLI 1.2.1 candidate

### Registry comparison

The npm registry reports `@revantaai/pawos-cli` latest as **1.2.0**, with integrity `sha512-gisMireRjW00bYqjp2hDIJg2JWoBR4WGdzOqKqmn0bjQE9XC6DM0DFP3WtBxcJeq0JKa49TnEX/plfdWcp2N6g==`. The downloaded published tarball’s SHA-256 is `9a88223ca197e50616d0e2381c0bfe76896bfe3415d958623be4e038e7f8bc04`; its `dist/pawos.js` is 267,973 bytes, SHA-256 `300b092bb73cec5fecb4b6a01d96ca523b1667f6d7ed6628c1a2e1fee30705d8`.

The current verified source includes the prompt-history fix and read-only `/env [tool]` diagnostics, neither of which is in the published 1.2.0 bundle. The current package README documents the command. `pawos-cli/package.json` and lockfile are prepared at **1.2.1**; Desktop remains independently versioned at 1.0.4.

### Tests, build, package, install, and compatibility

- Full serial suite: **35 files, 1,342 tests passed**. Includes 78 authentication tests and a real Windows `/env` diagnostic test that reads current and fresh CMD/PowerShell state without changing it.
- TypeScript and production build: `npm.cmd run build` — exit 0; bundle generated at 299.2 KiB.
- Candidate pack: `npm.cmd pack` — exit 0; 3 files (README, `dist/pawos.js`, package metadata), 88,987-byte tarball, package/unpacked size 327.4 kB. Candidate tarball SHA-256: `743ac6f2cb09ac710ce1e5f5a52955df4804d86fcbe91879ddbcd6855de0ea04`.
- Isolated install: installed the candidate tarball into a unique temporary prefix; npm added 3 packages. The installed `pawos version` command returned `PawOS v1.2.1` (exit 0). No global installation was changed.
- Node requirement is `>=20`; test/build ran on Node 20.20.1. README’s global install instruction remains `npm install -g @revantaai/pawos-cli`.
- Production API config defaults to `https://pawos.revantaai.com`; `PAWOS_API_URL` remains the documented override. Authentication behavior is covered by tests; no live production login was attempted.
- Registry lookup `npm view @revantaai/pawos-cli@1.2.1 version` returns 404, so 1.2.1 is not published. `npm whoami` returns **E401 Unauthorized**. No `npm publish` was performed.

### CLI release decision

**Version 1.2.1 is the correct next CLI patch release** for the verified prompt fix and additive diagnostics. The candidate is locally buildable, test-passing, packable, and install-smoke-tested. Publication remains blocked by missing npm registry authentication. Resolve npm publishing credentials, then publish this exact candidate and independently verify `npm view @revantaai/pawos-cli version` and registry integrity.

## 6. Release blockers

1. A Desktop 1.0.4 MSIX is now staged in `dist`, but has no WACK report and no proven mapping to the later current main source.
2. Current Desktop changes are uncommitted, so the checked-in Actions workflow cannot build those local edits. Freeze and commit/review the intended source before dispatching it.
3. No 1.0.4 WACK result, disposable install/launch/login smoke, or Partner Center submission evidence exists.
4. The workflow uploads a GitHub Actions artifact but does not submit to Partner Center; the Store upload step must be performed through the authorized Partner Center process after verification.
5. CLI 1.2.1 is prepared but cannot be published while npm returns E401. Live production authentication was not attempted.

## 7. Recommended release sequence

1. Review and commit the intended Desktop source changes. Confirm the current Store version in Partner Center; if 1.0.3 is still the latest accepted version, use Desktop version 1.0.4. Keep the CLI version independent.
2. Dispatch `.github/workflows/desktop-msix.yml` from that exact clean commit with the correct Store package version. Preserve the existing root `dist`; use the Actions artifact produced by the workflow rather than overwriting local artifacts.
3. Verify the new MSIX manifest identity/publisher/architecture, signature expectation, SHA-256, WACK report and report-to-package association. Require acceptable WACK results for the exact package.
4. Install the exact package in a disposable clean Windows VM; test launch, login and core flows. Record the tested package hash. Do not replace the existing 1.0.3 installation during this verification.
5. Upload the verified MSIX through Partner Center (the checked-in workflow does not do this), complete Store validation, and independently verify the submitted/listed version and status.
6. Resolve npm publishing authorization. Publish the verified `@revantaai/pawos-cli@1.2.1` candidate, then query npm and compare the published integrity/hash to the candidate tarball.
7. Report the independently confirmed Desktop and CLI publication states; keep the two version tracks separate.

## Changes made in this release-preparation task

- Updated `pawos-cli/package.json` and `pawos-cli/package-lock.json` to 1.2.1.
- Documented `/env` in `pawos-cli/README.md`.
- Added a real read-only Windows diagnostics integration test in `pawos-cli/src/local/environment.test.ts`.
- Copied the external 1.0.4 MSIX into the existing root `dist` after confirming that the destination did not exist and that the post-copy SHA-256 matched. The external original and all pre-existing artifacts remain unchanged.
- Created this report. Existing Desktop source and user changes were preserved; no CLI or Desktop source from the external checkout was copied over the current main tree.
