# Agent activity format review

Reviewed for the Chronicle universal-adapter phase. Detection of a project marker is not evidence that an agent was used. Chronicle does not read global or remote stores unless an existing exact-path external-source consent flow applies.

| Agent | Project-local config / metadata | Activity record location and format | Chronicle status |
| --- | --- | --- | --- |
| Cursor | `.cursor/` rules and `.cursorrules` are project configuration. | Cursor documents local chat history stored in an application SQLite database; no stable project-local transcript file contract is documented. Background Agent activity is remote. | Detection-only. No database or remote activity is read. |
| GitHub Copilot | `.github/copilot-instructions.md` and instruction files are configuration. | GitHub documents saved local/cloud agent sessions in the product, but no supported project-local raw transcript file format suitable for this adapter was found. | Detection-only. |
| Windsurf | `.windsurf/hooks.json`, rules, and scripts are project configuration. | Official Cascade Hooks document `post_cascade_response_with_transcript`, which writes trajectory JSONL under `~/.windsurf/transcripts/{trajectory_id}.jsonl`; records include `user_input`, `planner_response`, and `code_action` examples with `status`. The transcript can contain file content, command output, and tool arguments. Hooks may also write custom logs to arbitrary paths, but those files are user-defined, not a stable Windsurf project activity format. | Detection-only in project scope. The useful transcript is global and is not read. Custom project logs do not qualify without a standard format and explicit source support. |
| Cline | `.clinerules` and `.cline/` rules/skills/hooks are project configuration. | Sessions are stored in user-global application data. The Cline messages contract is versioned, but it describes application records, not a project-local session store. | Detection-only in project scope. External session parsing is not implemented. |
| Roo Code | `.roo/` rules/modes are project configuration. | Task histories are kept in VS Code extension global storage (or a configured storage directory); task files include conversation/UI/metadata JSON. | Detection-only. No global storage is inspected. |
| Aider | `.aider.conf.yml` and `.aiderignore` are configuration. | `.aider.chat.history.md` is a project-relative Markdown transcript by default; session markers, user entries and assistant output are written by Aider's I/O layer. `.aider.input.history` is prompt-input history, not parsed here. | **Implemented, parser v1** for the exact project-local chat history after per-file approval. Markdown is not a stable versioned schema. |
| Continue | `.continue/` config and rules are project configuration. | Continue CLI sessions are JSON records under the user's global `~/.continue/sessions/` directory; not project-local. | Detection-only. No global store is inspected. |
| OpenHands | `.openhands/` microagents and `.openhands.toml` are project configuration. | The documented trajectory interface is an authenticated API for a conversation; no supported project-local session record format was found. | Detection-only. No network/API activity is fetched. |

## Aider normalized coverage and limits

The Aider parser produces Chronicle's shared ordered events for session boundary, user prompt and assistant response. User and assistant order is retained from file order. A session-start marker can establish a session boundary but the current parser does not use its local wall-clock text as a precise event timestamp. The shared session analyzer can add a derived session-end boundary; this does not prove task completion.

Tool calls/results, model changes, explicit plans, subagents, background execution, failure/recovery and successful task completion are not structured in this Markdown format and are not inferred by the adapter. Aider's UI can place application/tool output within assistant output; this parser does not claim those are structured tool events. Raw text is transiently analyzed and omitted from normalized report payloads.

## Primary format references

- Aider options and chat history path: [Aider configuration options](https://aider.chat/docs/config/options)
- Aider writes session markers, user input and assistant output: [Aider `io.py`](https://github.com/Aider-AI/aider/blob/main/aider/io.py)
- Cursor local history: [Cursor chat history](https://docs.cursor.com/en/agent/chat/history)
- GitHub Copilot sessions: [GitHub Copilot agent sessions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/agent-sessions)
- Windsurf hook configuration: [Cascade Hooks](https://docs.windsurf.com/de/windsurf/cascade/hooks)
- Cline storage and CLI: [Cline CLI reference](https://github.com/cline/cline/blob/main/docs/cli/cli-reference.mdx)
- Cline message contract: [Messages contract v1](https://github.com/cline/cline/blob/main/sdk/packages/core/docs/messages-contract-v1.md)
- Roo task storage: [Roo Code storage implementation](https://github.com/RooCodeInc/Roo-Code/blob/main/src/utils/storage.ts)
- Continue CLI session storage: [Continue session implementation](https://github.com/continuedev/continue/blob/main/extensions/cli/src/session.ts)
- OpenHands trajectory API: [Get trajectory](https://docs.openhands.dev/api-reference/get-trajectory)

Upstream documentation and source can change. Parser support is limited to the local fixture-backed format and tested cases documented in Chronicle's test suite; it is not a claim of universal compatibility with every agent version.
