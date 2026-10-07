# pawos-shared

The code the PawOS CLI (`pawos-cli`) and the PawOS VS Code extension (`pawos-vscode`) have in common:

- `auth/` — the PawOS browser sign-in (one-time code), the session and its renewal
- `api/` — the client for the existing PawOS Web API, and its types
- `git/` — reading `owner/name` from a GitHub remote URL
- `task/` — request ids and following one Code-mode task to its result
- `model/` — how the repository and the checks are described to the user

It is plain TypeScript using Node built-ins only, with no dependencies and no build of its own.
Each client imports these files by relative path and bundles them (esbuild), so nothing here is
published or installed separately. Its tests live with the clients.
