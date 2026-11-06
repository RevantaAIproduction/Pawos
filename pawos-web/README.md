# PawOS Web

PawOS Web is the browser-based PawOS experience. It is one of three product experiences alongside PawOS Desktop and the independently installable PawOS CLI. They share a PawOS account, but their execution boundaries and available capabilities differ.

## Product boundaries

| Product | Work location | Main boundary |
|---|---|---|
| PawOS Web | PawOS services and connected GitHub repositories | Does not read a local computer's files or run its terminal commands. Repository checks/previews are read from GitHub. |
| PawOS CLI | The local folder where the user starts `pawos`, plus PawOS APIs for account/service features | Local project operations are constrained by the CLI's workspace and command policies. Current published npm is 1.2.0; local candidate 1.2.1 is unpublished. |
| PawOS Desktop | A selected local Windows workspace and Desktop runtimes | Can use local execution and Desktop-only environment, software, browser, process, and integration capabilities where implemented and permitted. Source presence does not certify a release or verify every workflow. |

PawOS on a phone is PawOS Web in a mobile browser or a paired view of a Desktop session. It does not add local terminal access to the phone.

## Architecture

This repository contains the Next.js Web application and API routes. Web requests use PawOS authentication, account entitlements, and server-side integrations. Desktop execution is implemented in the repository-root Electron app (`src/main`, `src/renderer`, `src/core`, and `src/shared`). The standalone CLI lives in `../pawos-cli`; shared API/authentication code is in `../pawos-shared`.

The user-facing documentation is structured TypeScript content in `src/lib/docs/content/`. Page types, navigation, registry, rendering components and search are in `src/lib/docs/`. Keep authored content in that structure and preserve its navigation/type checks. The historical flat `src/lib/docsContent.ts` is not the current structured page registry.

## Product and release claims

- Provider selection, model availability, pricing, entitlements and account limits are service-controlled and may change. This README intentionally does not promise a specific model/provider, offline behavior, tier price, or runtime count.
- Integration support varies by product and provider. The documentation should describe individual operations and permissions; a connector name alone does not mean every read/write action is available.
- The local CLI 1.2.1 candidate contains additional command implementations, but it was not published. It must not be described as the current npm release or live production functionality without publication and production endpoint verification.
- The current Desktop source package is version 1.0.4. The existing `dist/PawOS-1.0.4-x64.msix` is unsigned, has no matching WACK report or verified source provenance, and lacks disposable-environment runtime verification. It is **not certified or ready for Partner Center**. See [`PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md`](../PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md).

## Local development

From `pawos-web/`:

```bash
npm install
npm run dev
```

Available checks from `package.json`:

```bash
npm test
npm run lint
npm run build
```

The build command writes generated output. Do not run it as part of a docs-only change unless build artifacts are explicitly in scope. For the structured docs, run the relevant docs registry/parity/render tests and inspect the changed page in the local Web app.

## Documentation entry points

- [Structured PawOS docs](src/lib/docs/content/)
- [CLI package and usage](../pawos-cli/README.md)
- [Repository overview](../README.md)
- [Documentation audit](../PAWOS_DOCUMENTATION_AUDIT.md)
- [Desktop MSIX verification](../PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md)
