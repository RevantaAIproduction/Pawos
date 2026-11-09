# PawOS Chronicle — local development intelligence scanner

Chronicle is local-first. The scanner currently analyzes Git metadata plus approved Claude Code, Codex CLI and Gemini CLI session records. It does not read project source files, complete diffs, commit messages or author identities, and never executes project scripts. Agent record text is processed in memory for derived counts and is not written into the report or uploaded to PawOS.

## Local analysis

From a Git repository, `node chronicle/src/cli.js report` creates a local HTML report and sanitized JSON. From a parent folder it lists repository candidates and asks which to include. Chronicle previews known agent-session locations by path, file count and size without opening records. On an interactive terminal, you must explicitly select the exact external source locations to parse. Without a terminal approval prompt, it performs Git-only analysis. Reports and the local project identity key are kept in the user's application data directory. `reports` lists local snapshots; `preview` inventories project and session source metadata; `forget` removes Chronicle local data after confirmation.

## Session adapter support

| Adapter | Local location | Record shape parsed | Association | Limitations |
| --- | --- | --- | --- | --- |
| Claude Code | `~/.claude/projects/<encoded-cwd>/*.jsonl` | Observed JSONL records with `type=user/assistant`, `cwd`, `sessionId`, `timestamp`, and `message` | Exact recorded `cwd` match | Claude's local transcript schema is not a versioned public format. Sidecar/subagent records count as sessions only if they carry the matching `cwd`. |
| Codex CLI | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, plus `$CODEX_HOME/archived_sessions/rollout-*.jsonl` | Rollout JSONL with `session_meta`, `response_item`, and `event_msg` | Exact `session_meta.payload.meta.cwd` match | Model name is only included when the record exposes an actual model field; provider name is not treated as a model. Current user/assistant message and function-call shapes are recognized; unknown records are ignored. |
| Gemini CLI | `${GEMINI_CLI_HOME:-~/.gemini}/tmp/<project-hash>/chats/session-*.jsonl` | ConversationRecord JSONL metadata, message records, metadata updates, rewinds and message patches | Project hash matched to the selected canonical project path | Current shapes are versioned only in Chronicle's adapter. Model names appear only when session messages contain them. Hash/path normalization varies across platforms; unrecognized association is excluded. |

Adapter parser version is `1`; the upstream on-disk formats do not all publish their own stable version identifiers. Cursor, OpenCode, GitHub Copilot, Antigravity, IDE interaction, test/build/CI run evidence and remote-session capture are not implemented. Detection of tool installation or configuration is not evidence of use.

Fixtures and tests mirror publicly documented or upstream-visible record shapes. They are redacted test data, not a corpus captured from installed user agents. Compatibility with a user's exact application version can vary; Chronicle skips records it cannot safely associate or parse.

## Evidence and privacy limits

Session presence confirms a recorded agent session, not that an agent authored a commit. Git and session date overlap is displayed as temporal context only. Chronicle does not infer manual, AI-assisted or collaborative authorship from timestamps. Scores, archetypes and recovery claims remain unassigned unless validated evidence supports them. Prompt planning and correction signals are lexical counts, not quality judgements. Raw prompts, replies and tool output are neither persisted nor part of the cloud report.

## Public launcher status

The intended end-user launch is `curl -fsSL https://pawos.revantaai.com/chronicle/run | bash`. It uses a privately cached managed Node runtime and requires no global Node, npm setup, PATH change, Docker or cloned repository. The public endpoint is not deployed or verified. Release assets must be staged in PawOS Web, deployed, then verified at the exact public URLs before the command is advertised as usable.

Run package checks with `node --test` from this directory. The release packager archives the Chronicle source and pins its SHA-256; it does not deploy the public endpoint.
