// Detection is intentionally separate from parser support. A marker can show
// configuration or a local activity store without proving the agent was used.
export const AGENT_ADAPTERS = Object.freeze([
  { id: "claude-code", label: "Claude Code", detection: "project_config", parser: "external_only", markers: [".claude/settings.json", ".claude/CLAUDE.md", "CLAUDE.md"] },
  { id: "codex", label: "Codex CLI", detection: "project_config", parser: "external_only", markers: [".codex/config.toml"] },
  { id: "gemini-cli", label: "Gemini CLI", detection: "project_config", parser: "external_only", markers: ["GEMINI.md", ".gemini/settings.json"] },
  { id: "cursor", label: "Cursor", detection: "project_config", parser: "detection_only", markers: [".cursor/rules", ".cursorrules", ".cursorignore"] },
  { id: "github-copilot", label: "GitHub Copilot", detection: "project_config", parser: "detection_only", markers: [".github/copilot-instructions.md", ".github/instructions"] },
  { id: "windsurf", label: "Windsurf", detection: "project_config", parser: "detection_only", markers: [".windsurf/hooks.json", ".windsurf/rules", ".windsurfrules", ".codeium"] },
  { id: "cline", label: "Cline", detection: "project_config", parser: "detection_only", markers: [".clinerules", ".cline/rules", ".vscode/cline_mcp_settings.json"] },
  { id: "roo-code", label: "Roo Code", detection: "project_config", parser: "detection_only", markers: [".roo/rules", ".roo/modes", ".roomodes"] },
  { id: "aider", label: "Aider", detection: "project_config_and_activity", parser: "project_local", markers: [".aider.conf.yml", ".aiderignore"], activityMarkers: [".aider.chat.history.md", ".aider.input.history"] },
  { id: "continue", label: "Continue", detection: "project_config", parser: "detection_only", markers: [".continue/config.yaml", ".continue/rules"] },
  { id: "openhands", label: "OpenHands", detection: "project_config", parser: "detection_only", markers: [".openhands/microagents", ".openhands.toml"] },
  { id: "amazon-q", label: "Amazon Q Developer", detection: "project_config", parser: "detection_only", markers: [".amazonq/rules", ".amazonq/prompts"] },
  { id: "kiro", label: "Kiro", detection: "project_config", parser: "detection_only", markers: [".kiro/steering", ".kiro/hooks"] },
  { id: "opencode", label: "OpenCode", detection: "project_config", parser: "detection_only", markers: ["opencode.json", ".opencode/agents"] },
]);

export const FORMAT_PROBES = Object.freeze([
  { id: "jsonl", extensions: [".jsonl", ".ndjson"], parser: "detection_only" },
  { id: "json", extensions: [".json"], parser: "detection_only" },
  { id: "sqlite", extensions: [".sqlite", ".sqlite3", ".db"], parser: "detection_only" },
  { id: "markdown", extensions: [".md", ".markdown"], parser: "detection_only" },
]);

export function adapterForMarker(relativePath) {
  const marker = relativePath.replaceAll("\\", "/").toLowerCase();
  return AGENT_ADAPTERS.filter((adapter) => [...adapter.markers, ...(adapter.activityMarkers || [])].some((item) => marker === item.toLowerCase() || marker.startsWith(item.toLowerCase().replace(/\/$/, "") + "/")));
}

export function detectedFormat(relativePath) {
  const lower = relativePath.toLowerCase();
  return FORMAT_PROBES.find((probe) => probe.extensions.some((extension) => lower.endsWith(extension)))?.id || "unknown";
}
