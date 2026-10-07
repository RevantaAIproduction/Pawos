# PawOS for VS Code

A thin client of PawOS Web's Code mode. It signs in to your PawOS account, shows your plan and the
repository PawOS works on, sends one task, and shows the resulting commit or pull request.

PawOS works on the connected GitHub repository. Review the resulting commit or pull request. The
extension does not change files in the folder open in VS Code.

## Signing in

Choose **Sign In** in the PawOS sidebar. Your browser opens PawOS; sign in the way you always do
(Google, GitHub, or email and password) and click **Authorize**. PawOS shows an authentication
URL: copy it and paste it into the box at the top of VS Code. This is the same hand-off the PawOS
CLI uses.

The session is kept in VS Code SecretStorage only. No setup is needed: the extension talks to one
address, PawOS's (the **PawOS: Api Base Url** setting, which you only change to use a local
PawOS Web such as `http://localhost:3000`).

## Run it locally

```bash
npm install
```

```bash
npm run compile
```

```bash
code --extensionDevelopmentPath="%CD%"
```

Or open this folder in VS Code and press F5 ("Run PawOS Extension").

## Tests

```bash
npm test
```

## What it calls

| Purpose | Request |
|---|---|
| Sign in | `POST /api/auth/device/exchange`, `/refresh`, `/logout` |
| Plan and capabilities | `GET /api/web/capabilities` |
| Repository PawOS works on | `GET /api/web/github/repository` |
| Use this folder's repository (only when you ask) | `PUT /api/web/github/repository` |
| Run a task | `POST /api/web-chat/messages` with `mode: "codeChange"` |
| Progress and result | `GET /api/web/changes/{requestId}` |

Every API request carries `Authorization: Bearer <access token>`.

Shared client code (sign-in, API client, task runner, Git remote parsing) lives in
`../pawos-shared` and is bundled into `out/extension.js`.
