# Chronicle / Paxel Functional Parity Status

This matrix tracks Chronicle's current, independently implemented capabilities. Detecting a tool or configuration does not establish that it was used.

| Capability | Chronicle status before this increment | This increment | Remaining work |
|---|---|---|---|
| Project selection and Git discovery | CLI uses the current folder or discovers Git repositories beneath a selected parent; linked worktrees are grouped. | Project-local evidence inventory is scoped separately to each discovered repository. | Add a first-party folder picker only if the existing PawOS/launcher UX needs one. |
| Project-local AI tool discovery | Git/project marker discovery only; agent detection was limited to known external stores. | Extensible registry detects project configuration and recognizable activity-store paths for Claude Code, Codex CLI, Gemini CLI, Cursor, Copilot, Windsurf, Cline, Roo Code, Aider, Continue, OpenHands, Amazon Q, Kiro and OpenCode. Unknown activity-like paths are surfaced separately. | Expand fixtures for real, versioned formats and improve source-specific confidence without reading config contents. |
| External agent stores | Claude Code, Codex CLI and Gemini CLI JSONL adapters; global locations were inventoried during report runs. | Global stores are outside project scope by default. Inventory and exact-path consent require the explicit `--include-external` option. | Add explicitly selected custom external paths with per-path consent and adapter-safe association. |
| Agent event parsing | Ordered normalized events for Claude Code, Codex CLI and Gemini CLI, from their currently supported external stores. | Aider `.aider.chat.history.md` is parsed locally after exact-file approval; other newly surveyed tools remain detection-only. | Expand adapters only where real activity formats are documented and safely project-scoped or explicitly approved. |
| Session analysis and engineering episodes | Ordered event summaries and explicit-evidence episode grouping are implemented. | No change. | Validate coverage and grouping across independently approved projects. |
| Planning, decisions, AI steering, verification, recovery and product observations | Qualitative evidence-classified observations exist for supported event data; some categories are explicitly unavailable. | No score or new behavioral claim added. | Improve only where adapters provide direct, testable evidence. |
| Manual, AI-assisted and hybrid attribution | Git activity is separate; authorship remains unknown without direct attribution evidence. | No change. | Add direct contribution records only when a source can substantiate them. |
| Five engineering dimensions and archetypes | Dimension rows remain unscored; no archetype assignment. | No change. | Define and validate scoring methodology against representative independent histories before assigning scores or archetypes. |
| Local reports and privacy | Local report generation, opaque evidence references, coverage and upload preview exist. | Aider source coverage and limitations appear in reports; exact-file consent gates parsing. | Improve source coverage display and maintain parser-specific limitations. |
| PawOS cloud reports | Existing authenticated Next.js/Supabase report history, individual reports, private-by-default sharing and report-scoped interactions. | No PawOS product or database changes. | Add only Chronicle-specific fields when a future adapter needs a versioned DTO change. |
| Aggregated developer profile and history | Separate snapshots and a basic combined local overview exist. | No change. | Build an evidence-aware profile with deduplication, trend comparisons, and limitations across snapshots. |
| Paxel-style report experience | Chronicle report hierarchy and original Chronicle terminology are implemented in PawOS Web. | No change. | Continue validating information coverage against the supplied screenshots while preserving Chronicle's original language and palette. |

## Discovery contract added in this increment

- The selected project root is the only tree traversed for project-local discovery.
- Aider chat history is parsed only from the exact selected project's `.aider.chat.history.md` file and only after an exact-file grant.
- Global session stores for agents other than the existing opt-in Claude Code, Codex CLI and Gemini CLI adapters are not read.
- Traversal is bounded, skips sensitive filenames and generated/dependency directories, and rejects symlinks.
- Discovery reads names and filesystem metadata only. It does not open config files, transcripts, source files or activity stores.
- Project markers and activity artifacts are reported separately from parser support and actual-use evidence.
- Known machine-wide agent stores are described as outside the selected project without checking whether they exist. They are inventoried only after an explicit CLI opt-in; reading still requires the existing exact-path consent.
- Files discovered in unsupported formats remain unsupported and are not executed or parsed.
