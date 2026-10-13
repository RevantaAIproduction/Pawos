# PawOS CLI

PawOS in your terminal: ask PawOS anything from any folder, have it work on the project folder you
start it in, or have it make changes in your connected GitHub project.

```bash
npm install -g @revantaai/pawos-cli
```

```bash
pawos
```

`pawos` starts in any folder. Git is not required.

## Requirements

- Node.js 20 or newer
- A PawOS account
- To work on a project on this computer: a paid PawOS plan. Git is optional there.
- To change a GitHub repository instead: Git, a project cloned from GitHub, and GitHub connected to
  your PawOS account

## Using it

```bash
pawos
```

PawOS opens in the terminal, greets you, shows where you are and asks what you would like to work on. In an
ordinary folder it shows just the folder; inside a Git project it also shows the branch and the
GitHub repository. If you are signed out, `pawos` signs you in first and carries straight on.

Type and press Enter. What happens next depends on the mode, which is always shown above the prompt:

- **Local mode** — on by default when you start `pawos` inside a project folder. PawOS works on the
  files in that folder, on this computer. See [Working on a local project](#working-on-a-local-project).
- **Chat** — your message goes to PawOS and its reply is printed. This is the same PawOS chat as on
  PawOS Web, so the conversation also appears in your PawOS chats. It is the mode outside a project
  folder, and `/chat` switches to it anywhere.
- **GitHub changes** — `/remote <request>` asks PawOS to make the change in the project's GitHub
  repository instead of in your local files. PawOS asks your permission, reads the repository on
  GitHub, commits the change there, and shows you the summary, the files changed, the state of your
  checks, and the commit or pull request. Your local folder is not touched — pull the change once
  you have reviewed it. Outside a local project, a change request in a GitHub project goes this way.

A greeting ("hii") or a question about PawOS itself is answered as chat, in any mode, and nothing
is changed.

## Working on a local project

Start `pawos` in the project's folder. The folder does not have to be a Git repository. PawOS does
not treat a drive root, your home folder or an operating-system folder as a project; there it
opens in Chat.

In Local mode PawOS's service decides the next step and the CLI carries it out here, one step at a
time: listing, reading and searching files; creating, editing and deleting files; running the
project's tests and build and other development commands; Git operations; starting and stopping a
development server. Each result goes back to PawOS, which decides what to do next. When the task
ends, the CLI prints what was actually changed and what each command's exit code was.

Before the first task in a folder the CLI asks whether PawOS may read files there. After that:

- **File changes** — shown as a difference, and asked about first (`/mode ask`, the default).
  `/mode auto` makes changes without asking. Deleting is always asked about.
- **Commands** — run without a shell, as one program and its arguments. Only development programs
  are run (`npm`, `npx`, `node`, `git`, `python`, `pip`, `yarn`, `pnpm`, `java`, `javac`); pipes,
  `&&`, redirects and similar are refused. In ask mode every command is put to you first; in auto
  mode routine ones run, and ones that install or change dependencies are still asked about.
- **Git** — staging, committing, creating and switching branches go through their own steps. A push
  is always asked about. There is no step for force, reset, clean, rebase, merge or pull.
- **A development server** — started as a program that keeps running. The CLI reports the local
  address the server itself printed, or says that it printed none. `/stop` stops what PawOS started;
  leaving PawOS stops it too.
- **Opening a browser** — only for an address on this computer (`localhost`, `127.0.0.1`), and
  always asked about. PawOS cannot see the page: it never reports a page as checked.
- **`/mode plan`** — PawOS may look at the project and proposes a plan; it changes nothing.

`/undo` puts back the files PawOS changed in its last task in this folder: files it created are
removed, files it changed or deleted are restored. It does not undo commands that were run. A file you have
changed again since is left as it is, and the CLI says so.

PawOS stays inside the project folder. It does not read or write outside it, does not follow links
that lead out of it, and does not read `.env` files, keys and similar secrets, `node_modules`, or
build output. A step that would is refused, and PawOS is told so.

### Longer prompts

- Pasting several lines sends them as one message.
- End a line with `\` to continue on the next line.
- Up and Down recall what you sent earlier in this session.

### When PawOS's model is busy

If PawOS answers that its model could not be reached, the CLI sends the same step again, up to
five times with growing waits (about a minute and a half in all), and shows that it is doing so.
A step that already ran — a file written, a command run — is not run again; only its result is
sent again. If the model stays unavailable the task ends with PawOS's message, and the summary
still lists what was changed up to that point. A refusal, a usage limit or an expired session is
never retried.

Leave with `/exit` or Ctrl+D. Ctrl+C asks before leaving.

### Inside PawOS

| Command | What it does |
|---|---|
| `/code [request]` | Work on this project (on this computer when you are inside one) |
| `/remote <request>` | Make a change in this project's GitHub repository |
| `/chat` | Talk to PawOS without changing anything |
| `/connections` | Show your account's connections |
| `/connect <name>` | Connect a service, for example `/connect github` |
| `/mode [name]` | Ask before code changes (`ask`), don't ask (`auto`), or plan only (`plan`) |
| `/resume [number]` | List earlier PawOS work, or open one and carry on with it |
| `/undo` | Put back the files PawOS changed in its last task here |
| `/stop` | Stop the programs PawOS left running (a development server) |
| `/attach <file>` | Send one text file (up to 60 KB) with your next chat message |
| `/status` | Show your account, plan, usage and connections |
| `/help` | List these commands |
| `/exit` | Leave PawOS |

### From the shell

| Command | What it does |
|---|---|
| `pawos` | Open PawOS, from any folder |
| `pawos login` | Sign in, then open PawOS |
| `pawos logout` | Sign out on this computer |
| `pawos status` | Show your account, plan, usage and connections (changes nothing) |
| `pawos version` | Show the version |

## Asking before a change on GitHub

A change made with `/remote` is pushed to your repository on GitHub, so PawOS asks first. It shows
the repository and asks **allow**, **deny** or **always allow**. Only an explicit yes sends it;
Enter, Ctrl+C or anything unclear sends nothing. (Local mode asks step by step instead — see
[Working on a local project](#working-on-a-local-project).)

- `/mode ask` — ask every time (the default).
- `/mode auto` — don't ask. "Always allow" switches to this for the rest of the session.
- `/mode plan` — PawOS talks the change through and changes nothing. For a GitHub change it plans
  from your description and does not read the repository; in Local mode it may read the project.

The mode lasts for the session and only controls whether the CLI asks. It is never sent to PawOS and
cannot allow anything your plan doesn't. `accept-edits` and `bypass-permissions` are accepted as
names for `auto`.

## Earlier work

When you have used PawOS before, the start screen shows your three most recent conversations.
`/resume` lists the last ten; `/resume 2` opens one, shows how it ended, and your next message
continues it.

## Your account, plan and usage

`pawos status` and `/status` show what PawOS reports for your account right now: the plan, usage
against your allowances and any extra-usage credits (in Paw Compute, PawOS's own unit), which
capabilities the plan includes, and which services are connected. A value PawOS doesn't report is
left out; nothing is estimated or calculated here.

PawOS decides what your account may do, on its servers, exactly as it does for PawOS Web and the
desktop app. When it refuses something — a usage limit, a feature the plan doesn't include, an
organization permission — the CLI shows PawOS's message, your plan, and the address of PawOS's
plans page, then returns to the prompt. The CLI takes no payment and holds no payment details;
plans and billing are managed on PawOS itself.

## Connections

Your connections belong to your PawOS account, not to a folder: `/connections` lists the same ones
wherever you run `pawos`. `/connect <name>` does not connect anything itself: it tells you where
PawOS connects that service — PawOS's Integrations page in your browser, or the PawOS desktop app —
and, once you have completed the connection there and pressed Enter, asks PawOS whether it is
connected. It reports a service as connected only when PawOS says so. The CLI runs no sign-in of
its own with those services and never sees their tokens.

## Signing in

```bash
pawos login
```

The CLI prints a PawOS address and waits. It does not open a browser for you, so you choose where
to open it: another browser, another profile, or your own computer when you are working over SSH.

1. Open the printed address in your browser.
2. Sign in to PawOS the way you always do: Google, GitHub, or email and password. If the browser
   is already signed in, PawOS shows that account; choose **Use a different account** to sign in
   as someone else.
3. Click **Authorize**. PawOS shows an authentication URL with a **Copy URL** button.
4. Return to the terminal and paste the URL.

PawOS then opens, signed in.

The authentication URL works once and expires after five minutes. The CLI only reads it; it never
opens it. It accepts nothing but PawOS's own completion address, and the one-time value inside it
is of no use to anyone except the CLI that started the sign-in.

## Your repository

`pawos` reads the Git remote of the folder you are in. It understands the usual GitHub forms:

```
https://github.com/owner/repo.git
https://github.com/owner/repo
git@github.com:owner/repo.git
git@github.com:owner/repo
```

It then compares that repository with the one selected in your PawOS account:

- **They match** — PawOS is ready.
- **They differ** — the CLI shows both and asks whether to use the local repository in PawOS. It
  never switches by itself. Saying yes also changes the selection on PawOS Web.
- **No GitHub repository here** — PawOS still opens: in Local mode inside a project folder,
  otherwise in Chat. `/remote` explains why a GitHub change isn't possible (not a Git repository,
  no remote, or a remote that isn't GitHub). It never falls back to another repository.

## If something is interrupted

A task or a message is sent to PawOS once. If your connection drops, the CLI asks PawOS about that
same request; it never sends it a second time. If you press Ctrl+C while PawOS is working on a code
task, the task keeps running on PawOS and the CLI remembers its request ID: run `pawos` in the same
project again and it offers to check on it.

## Current limitations

Local mode:

- Larger tasks are not yet reliable. Reading a project, running its build and writing small files
  work; a step that has to write a large file in one go can fail, and a task that needs several
  such steps (a whole new screen, say) may end partway. What was changed up to then is listed, and
  `/undo` puts it back. Smaller, specific requests work best.
- PawOS's model is sometimes unavailable for minutes at a time. The CLI retries, then gives up
  with PawOS's message.
- A task is limited in steps and in time, and one file PawOS writes is limited to 512 KB.
- A command that does not finish is stopped: 45 seconds for an ordinary command, five minutes for
  a build or the tests. Use a development server for anything that should keep running.
- There is no rename or move step; PawOS creates the new file and deletes the old one.
- PawOS cannot see a browser, a running app or an image. It can ask your browser to open a local
  page; it cannot check what the page looks like.
- Programs outside the list above (and anything needing a shell) are not run.
- It needs a paid plan. On Paw Go, PawOS refuses a local task and says so.

GitHub changes (`/remote`):

- PawOS works on the repository on GitHub, not on your local working tree. Uncommitted local
  changes are not seen.
- A change is pushed to the repository's default branch. If that branch is protected, PawOS
  pushes to a new branch and opens a pull request instead.
- On paid plans PawOS reads the code before changing it: it starts from the files the task points
  at, follows what they import (a few rounds, within your plan's file limit), and plans the change
  from what it read. It does not search the whole repository, and it cannot see who calls a file
  it hasn't read.
- PawOS does not build or run your code there. It reads what your repository's own checks and
  preview deployments report, as one overall result, and fixes a failure they report (within your
  plan's limit). If your repository has no checks or preview deployments, the change is pushed but
  not verified, and PawOS says so.

Everywhere:

- You cannot choose the model: PawOS's service uses its own, and offers no choice to clients.
- You cannot send a folder. One text file can go with a chat message (`/attach`); images and files
  with a code change are not supported from the CLI.
- Using your connected services from a conversation — reading GitHub issues, Slack messages or
  Google Drive files, creating a Linear ticket, calling an MCP server — runs only in the PawOS
  desktop app today. PawOS's servers do not offer it to PawOS Web or to this CLI, so when you ask
  for it here PawOS tells you it needs the desktop app, and nothing is done.
- Autonomous Work (ticket solving) likewise runs only in the PawOS desktop app, and its ticket
  balance is not shown here.
- Most services are connected from PawOS's Integrations page or the desktop app; the CLI points
  you there and checks the result.
- Plan limits are the same as on PawOS Web, because the same service does the work.

## Not available from the CLI yet

These need PawOS's servers to offer them to signed-in clients other than the desktop app. Today
they don't, so the CLI does not attempt them and does not work around it — it never reaches into
the desktop app, a database or a provider directly.

| Capability | What PawOS's servers offer today | What the CLI does |
|---|---|---|
| MCP tool calls | None outside the desktop app (`web.mcpRead` is reported as desktop-only) | Shows the status; a request is answered by PawOS with "needs PawOS Desktop" |
| Connector actions (GitHub issues, Slack, Google Drive, Linear, ...) | None outside the desktop app | Same |
| Connecting a service | Listing and status; the connection itself is made in a browser on PawOS's Integrations page, or in the desktop app | Says where, then checks the status |
| Autonomous Work (ticket solving) | None (`web.autonomousWork` is reported as not available yet) | Shows the status; cannot start it |
| Ticket balance | Not returned by any client API | Not shown |
| Usage and credits | Read-only, in Paw Compute (`/api/dashboard/overview`) | Shown as returned |
| Plan and entitlements | The plan label and each capability's status (`/api/web/capabilities`) | Shown as returned; PawOS enforces them |

Supporting the first five from the CLI is server work: PawOS would need to expose them through its
authenticated API, with the same plan, credit and organization checks it applies in the desktop app.

## Security

- The CLI talks only to PawOS's authenticated API, and PawOS decides there what the account may do.
  It never talks to the desktop app's internals, to the database, or to a connected service.

- The CLI never asks for your password, and never asks you to paste an access token.
- Your session is kept in your operating system's credential store: Windows Credential Manager,
  the macOS Keychain, or the Secret Service (GNOME Keyring / KWallet) on Linux. Only the refresh
  token and your email address are stored; the access token is held in memory for one run.
- If no credential store is available (for example on a server with no desktop session), the
  session is kept in a file in your own configuration folder that only your user can read, and
  the CLI tells you where. It is never written inside your project; if there is nowhere safe to
  keep it, sign-in fails instead.
- The CLI holds no GitHub token, no model key and no service key. GitHub access stays on PawOS's
  servers.
- In Local mode the CLI, not PawOS's service, decides whether a step is allowed: the service can
  ask for a step but cannot mark one as safe. File contents PawOS reads are sent to PawOS's
  service to work on; files the CLI refuses to read are never sent.
- The CLI talks to one address: PawOS's. It prints no tokens, in normal output or in errors.
- Text that comes back from PawOS is cleaned before it is printed, so it cannot send control
  sequences to your terminal. Only https links are printed as links.

## Environment variables

| Variable | Purpose |
|---|---|
| `PAWOS_API_URL` | Use another PawOS address (for example a local development server). https only, except `localhost`. |
| `PAWOS_NO_ANIMATION` | Skip the startup animation and print plain progress lines instead of the animated display. |
| `PAWOS_ASCII` | Use plain ASCII marks instead of symbols. |
| `NO_COLOR` | Turn colour off. |
| `PAWOS_CONFIG_DIR` | Where the CLI keeps its small state files. |
| `PAWOS_DEBUG` | After a failed message, also print the HTTP status, PawOS's error code and how long it took. Never prints a token or a reply. |

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

The build writes `dist/pawos.js`, the single file installed as the `pawos` command. Shared client
code lives in `../pawos-shared` and is bundled in.
