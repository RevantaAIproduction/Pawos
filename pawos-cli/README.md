# PawOS CLI

PawOS in your terminal. Describe a change, and PawOS makes it in your connected GitHub project.

```bash
npm install -g pawos
```

```bash
pawos
```

PawOS works on your connected GitHub project: it reads the repository on GitHub, commits the
change there, and shows you the commit or pull request. It does not edit the files in your local
folder — pull the change once you have reviewed it.

## Requirements

- Node.js 20 or newer
- Git
- A PawOS account with GitHub connected (connect GitHub in the PawOS desktop app)
- A project cloned from GitHub

## Using it

Run `pawos` from your project's folder:

```bash
cd my-project
pawos
```

PawOS signs you in if needed, shows the repository it will work on, and asks what you would like
it to do. Type the task and press Enter. While it works you see the steps PawOS reports; when it
finishes you see the summary, the files changed, the state of your repository's checks, and the
commit and pull request links.

Leave with `exit`, Ctrl+C or Ctrl+D.

### Commands

| Command | What it does |
|---|---|
| `pawos` | Start PawOS in this project |
| `pawos login` | Sign in to PawOS in your browser |
| `pawos logout` | Sign out on this computer |
| `pawos status` | Show the account and repository PawOS will use (changes nothing) |
| `pawos version` | Show the version |

## Signing in

```bash
pawos login
```

1. The CLI opens PawOS in your browser. (It also prints the address, in case the browser doesn't open.)
2. Sign in to PawOS the way you always do — Google, GitHub, or email and password.
3. Confirm, and PawOS shows a one-time authentication code such as `PAWOS-8F4K-92KD`.
4. Paste the code into the terminal.

The code works once and expires after five minutes. Running `pawos` while signed out starts the
same flow.

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
- **No GitHub repository here** — the CLI explains why (not a Git repository, no remote, or a
  remote that isn't GitHub) and stops. It never falls back to another repository.

## If something is interrupted

A task is sent to PawOS once. If your connection drops, or you press Ctrl+C while PawOS is
working, the task keeps running on PawOS and the CLI remembers its request ID. Run `pawos` in the
same project again and it offers to check on that task — it asks PawOS for the result and never
sends the task a second time.

## Current limitations

- PawOS works on the connected GitHub repository, not on your local working tree. Uncommitted
  local changes are not seen.
- A change is pushed to the repository's default branch. If that branch is protected, PawOS
  pushes to a new branch and opens a pull request instead.
- PawOS does not run your code. It reads what your repository's own checks and preview
  deployments report, as one overall result.
- Plan limits are the same as on PawOS Web, because the same service does the work.

## Security

- The CLI never asks for your password, and never asks you to paste an access token.
- Your session is kept in your operating system's credential store: Windows Credential Manager,
  the macOS Keychain, or the Secret Service (GNOME Keyring / KWallet) on Linux. Only the refresh
  token and your email address are stored; the access token is held in memory for one run.
- If no credential store is available (for example on a server with no desktop session), the
  session is kept in a file only your user can read, and the CLI tells you where.
- The CLI holds no GitHub token, no model key and no service key. GitHub access stays on PawOS's
  servers.
- The CLI talks to one address: PawOS's. It prints no tokens, in normal output or in errors.
- Text that comes back from PawOS is cleaned before it is printed, so it cannot send control
  sequences to your terminal.

## Environment variables

| Variable | Purpose |
|---|---|
| `PAWOS_API_URL` | Use another PawOS address (for example a local development server). https only, except `localhost`. |
| `PAWOS_NO_BROWSER` | Don't try to open a browser; just print the sign-in address. |
| `PAWOS_NO_ANIMATION` | Print plain progress lines instead of the animated display. |
| `PAWOS_ASCII` | Use plain ASCII marks instead of symbols. |
| `NO_COLOR` | Turn colour off. |
| `PAWOS_CONFIG_DIR` | Where the CLI keeps its small state files. |

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
