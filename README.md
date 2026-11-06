# PawOS — An AI Development Operating System

PawOS brings project understanding, planning, implementation, and evidence into three product experiences. Each has a different execution boundary; a capability in one is not automatically available in another.

## Choose your PawOS experience

| Experience | Where work runs | Best for |
|---|---|---|
| **PawOS Desktop** | On a Windows computer, within a selected local workspace | Local project work, development commands, environment and software management, validation, recovery, and Desktop integrations. Actions are subject to permissions and product support. |
| **PawOS CLI** | In your terminal, against the local project folder where you start it | A terminal-based coding agent for Git and non-Git folders. It runs independently of the Desktop app; account sign-in may require a browser. |
| **PawOS Web** | In a browser, using PawOS Web and connected GitHub repositories | Browser-based chat, GitHub-based coding tasks, and review of repository checks and previews. It does not access local files or run commands on your computer. |

PawOS on a phone is Web in a mobile browser, or a paired view of an active Desktop session. It is not a fourth local execution runtime.

## Install the CLI

The independently installable CLI requires Node.js 20 or newer:

```bash
npm install -g @revantaai/pawos-cli
pawos
```

The current published npm version is **1.2.0**. A local 1.2.1 candidate has not been published. See the [CLI README](pawos-cli/README.md) for authentication, project boundaries, commands, security, and the separate published/candidate capability lists.

CLI local project usage does not require PawOS Desktop or a PawOS Web installation. Sign-in uses a browser handoff to your PawOS account; the CLI never asks for your password in the terminal.

## Use PawOS Web

Open [PawOS Web](https://pawos.revantaai.com/app) in a supported browser and sign in to your account. Web coding works from connected GitHub repositories and the checks/previews those repositories provide. For local files, local development commands, or Desktop integrations, use the product that implements that capability.

See the structured [PawOS product documentation](pawos-web/src/lib/docs/content/) for the product comparison, getting started, security, coding, integrations, and known limitations.

## PawOS Desktop and release status

Desktop is the Windows application and local development companion. Its source includes coding/execution, environment and software management, validation/recovery, Work Records, managed browser/process features, and integrations. Source-level presence does not certify a packaged release or mean every browser, package manager, provider, or workflow is supported.

The existing Desktop 1.0.4 MSIX has **not** been certified: it is unsigned, has no matching WACK report or verified build provenance, and has not passed disposable-environment installation/runtime checks. It is not ready for Partner Center. See [Desktop MSIX verification](PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md). Do not use that artifact as release evidence.

## Repository documentation

- [CLI installation and usage](pawos-cli/README.md)
- [Web app developer README](pawos-web/README.md)
- [VS Code extension README](pawos-vscode/README.md)
- [PawOS documentation audit](PAWOS_DOCUMENTATION_AUDIT.md)
- [Desktop MSIX verification](PAWOS_DESKTOP_MSIX_FINAL_VERIFICATION.md)

Historical audit reports, plans, and implementation notes in the repository are internal records. Check their date and status before treating them as current product documentation.
