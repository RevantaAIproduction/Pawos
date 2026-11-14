# Engineering outcome evidence

Schema 8 adds a bounded, sanitized `engineeringOutcomes` list and report-level coverage counters. Detailed event streams remain in the local Chronicle store; outcome references are opaque hashes or session keys. The local report HTML and PawOS report can display the summaries. Historical PawOS profiles deduplicate outcome IDs per project and retain snapshot first/last seen dates. Repeated report uploads do not add repeated outcome counts.

## Supported records in this release

| Source | Record evidence | Outcome represented | What it does not prove |
| --- | --- | --- | --- |
| Claude Code | A `tool_use` and its `tool_result` with an explicit `tool_use_id` / `tool_use_id` relationship | `tool_execution`: passed, failed, or unknown | It does not classify the tool as a test/build/review or establish task completion. |
| Codex CLI | Function call/output linkage; `exec_command_end` exit-code status is retained as a generic linked tool result | `tool_execution`: passed, failed, or unknown | Command arguments are discarded, so exit status is not labelled as a test/build/type-check outcome. |
| Gemini CLI | Conversation tool-call result/status when present | `tool_execution`: passed, failed, or unknown | Status is an adapter-reported operation result, not verified test or build semantics. |
| Aider | Markdown chat turns only | No tool execution outcomes | The format does not provide structured tool calls, exit status, test results, or review records. |
| Git | Commit identity and supported episode grouping | `git_commit`: committed, with direct, inferred, or unlinked relationship | No human/agent authorship, review approval, merge acceptance, or causal link is claimed. |
| Codex plan events | Explicit `event_msg.plan_create`, `plan_update`, or `plan_delta` | `plan_lifecycle`: created or revised | Plan contents, execution, deviation, and completion are unavailable. |
| Supported session adapters | Ordered developer correction and later event sequence | `correction`: response observed or unresolved | The follow-up may be unrelated and does not establish that the correction worked. |

Direct references mean a source record explicitly carries the call, result, or commit identifier. Inferred associations use the existing episode grouping rules (for example, multiple matching file references). Inferred relationships are classified probable and medium confidence. Unsupported relationships remain unlinked.

## Not available

No current adapter provides independently trustworthy test-suite/build/type-check semantics, review approval/rejection, pull-request acceptance, CI result, or product decision outcomes. A command or tool name containing `test`, `build`, or `lint` remains a heuristic. A successful shell/tool result is only a successful operation. Cancellation and task completion are not inferred from missing result rows or later activity.

The web API validates the v8 schema, outcome identifier derivation, reference membership, source record type, category/state pairing, and coverage arithmetic. Session outcome semantics are locally generated and are not independently server-verified because cloud uploads omit the full event stream and raw tool payloads.
