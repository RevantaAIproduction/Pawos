# RELEASE_CHECKLIST.md

## Pre-build checklist
- [ ] Working tree clean (or intentionally documented changes)
- [ ] `npm install` completed
- [ ] Confirm build scripts and versions:
  - Electron: 35.0.0
  - Electron Builder: 26.8.6

## Validation checklist (required)
- [ ] TypeScript passes
- [ ] `npm run build:renderer` succeeds
- [ ] `npm run build:main` succeeds
- [ ] `npm run package` succeeds

## Packaging checklist
- [ ] Electron Builder configuration valid (`electron-builder.yml`)
- [ ] Windows artifacts generated (installer/exe/msi as configured)
- [ ] Artifacts are present on disk

## Installer verification checklist (Windows)
- [ ] Run installer in a test VM or disposable environment
- [ ] App launches successfully
- [ ] Tray icon appears
- [ ] Desktop pet window renders and responds to inputs

## Release artifact checklist
- [ ] Screenshot of installed app
- [ ] Logs retained for build and packaging
- [ ] Version/release notes documented

## Release gate
Do not mark a release as complete unless:
- Build and packaging evidence exists (logs + artifacts).
- Runtime behavior is verified on at least one pet.

