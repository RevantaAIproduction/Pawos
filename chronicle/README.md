# PawOS Chronicle — local development intelligence scanner

Chronicle is local-first. The scanner analyzes Git metadata, the approved project-local Aider chat history when present, and approved Claude Code, Codex CLI and Gemini CLI session records from external stores. It does not read project source files, complete diffs, commit messages or author identities, and never executes project scripts. Agent record text is processed in memory for derived counts and is not written into the report or uploaded to PawOS.

## Local analysis

From a Git repository, `node chronicle/src/cli.js report` creates a local HTML report and sanitized JSON for that repository. From a parent folder it lists independent repository candidates and asks which to include. Chronicle uses Git metadata to group linked worktrees under their original repository. Project-local discovery reads names and filesystem metadata only. If `.aider.chat.history.md` is present, Chronicle offers that exact file for approval; contents are not opened before approval. Other project configuration is not treated as activity. Machine-wide agent stores are outside project scope by default and are not checked. To opt in for a run, use `node chronicle/src/cli.js report --include-external`; Chronicle then inventories known locations and asks approval for each exact source path before parsing. A previous grant is applied only when this explicit opt-in flag is present. Reports and the local project identity key are kept in the user's application data directory. `reports` lists local snapshots; `preview` shows project-local markers and lists external store options without checking their availability; `forget` removes Chronicle local data after confirmation.

`node chronicle/src/cli.js scan` shows the same project-local preview. Add `--include-external` only when you want to inventory external stores and save consent for exact paths. Neither command executes project files.

## Session adapter support

| Adapter | Local location | Record shape parsed | Association | Limitations |
| --- | --- | --- | --- | --- |
| Claude Code | External: `~/.claude/projects/<encoded-cwd>/*.jsonl` | Observed JSONL records with `type=user/assistant`, `cwd`, `sessionId`, `timestamp`, and `message` | Exact recorded `cwd` match against the repository root or a Git-registered linked worktree | External to project scope by default; requires `--include-external` and exact-path consent. Claude's local transcript schema is not a versioned public format. |
| Codex CLI | External: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, plus archived sessions | Rollout JSONL with `session_meta`, `response_item`, and `event_msg` | Exact `session_meta.payload.meta.cwd` match against the repository root or a Git-registered linked worktree | External to project scope by default; requires `--include-external` and exact-path consent. Unknown records are ignored. |
| Gemini CLI | External: `${GEMINI_CLI_HOME:-~/.gemini}/tmp/<project-hash>/chats/session-*.jsonl` | ConversationRecord JSONL metadata, message records, metadata updates, rewinds and message patches | Project hash matched to the selected canonical project or a Git-registered linked worktree | External to project scope by default; requires `--include-external` and exact-path consent. Unrecognized associations are excluded. |
| Aider | Project-local: `.aider.chat.history.md` | Markdown session markers, `####` user entries and recorded assistant output | Exact selected-project file only | Parser v1; requires exact-file approval. No structured tool calls/results, per-turn timestamps, model changes or completion status. Markdown is not a formally versioned transcript contract; application output may appear in assistant text. `.aider.input.history` is not parsed. |

Project-local detection includes markers for Claude Code, Codex CLI, Gemini CLI, Cursor, GitHub Copilot, Windsurf, Cline, Roo Code, Aider, Continue, OpenHands, Amazon Q Developer, Kiro and OpenCode. Of these, only Aider's exact `.aider.chat.history.md` project file is currently parsed. The others' project markers indicate configuration only, not activity. Unknown session-like project files are surfaced as unidentified and remain unparsed.

The scan summary distinguishes files discovered, files read, distinct valid session identifiers parsed, unique sessions associated with the selected repository, and deduplicated sessions included in each report. Duplicate session IDs found in copies under different registered worktrees count once.

Adapter parser versions describe Chronicle implementations; upstream on-disk formats do not all publish stable versions. IDE interaction, test/build/CI run evidence and remote-session capture are not implemented. Detection of tool configuration or project markers is not evidence of use. For Cursor, GitHub Copilot, Windsurf, Cline, Roo Code, Continue and OpenHands, Chronicle does not parse machine-wide or remote histories in this phase.

Fixtures and tests mirror publicly documented or upstream-visible record shapes. They are redacted test data, not a corpus captured from installed user agents. Compatibility with a user's exact application version can vary; Chronicle skips records it cannot safely associate or parse.

## Evidence and privacy limits

Session presence confirms a recorded agent session, not that an agent authored a commit. Git and session date overlap is displayed as temporal context only. Chronicle does not infer manual, AI-assisted or collaborative authorship from timestamps. Scores, archetypes and recovery claims remain unassigned unless validated evidence supports them. Prompt planning and correction signals are lexical counts, not quality judgements. Raw prompts, replies and tool output are neither persisted nor part of the cloud report.

## Public launcher status

The intended end-user launch is `curl -fsSL https://pawos.revantaai.com/chronicle/run | bash`. It uses a privately cached managed Node runtime and requires no global Node, npm setup, PATH change, Docker or cloned repository. The public endpoint is not deployed or verified. Release assets must be staged in PawOS Web, deployed, then verified at the exact public URLs before the command is advertised as usable.

Run package checks with `node --test` from this directory. The release packager archives the Chronicle source and pins its SHA-256; it does not deploy the public endpoint.
