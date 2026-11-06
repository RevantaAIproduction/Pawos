import { describe, expect, it } from "vitest";
import { documentationNote } from "./agent";
import type { ToolCall, ToolResult } from "./protocol";

const workspace = { name: "shop", branch: "main", filesTruncated: false, files: ["src/components/Button.tsx", "docs/components/README.md", "docs/api.md", "CHANGELOG.md", "app/api/orders/route.ts"] };
const ok: ToolResult = { ok: true, output: "done" };
const step = (name: string, args: Record<string, unknown>, result: ToolResult | null = ok) => ({ call: { name, args } as unknown as ToolCall, note: null, result });

describe("the CLI agent's documentation note (from the task's own changes)", () => {
  it("names the kept documents that the files the agent really changed affect", () => {
    const note = documentationNote({ workspace, steps: [step("read_file", { path: "src/components/Button.tsx" }), step("edit_file", { path: "src/components/Button.tsx", oldText: "a", newText: "b" }), step("write_file", { path: "app/api/orders/route.ts", content: "x" })] });
    expect(note).toContain("- docs/components/README.md: a component changed (src/components/Button.tsx)");
    expect(note).toContain("- docs/api.md: an API handler changed (app/api/orders/route.ts)");
    expect(note).toContain("CHANGELOG.md");
    expect(note).toMatch(/Leave text between <!-- pawos:begin/);
  });

  it("says nothing when nothing was changed, a change was refused or failed, or the docs were already updated", () => {
    expect(documentationNote({ workspace, steps: [step("read_file", { path: "src/components/Button.tsx" })] })).toBe("");
    expect(documentationNote({ workspace, steps: [step("edit_file", { path: "src/components/Button.tsx" }, { ok: false, output: "denied", denied: true })] })).toBe("");
    expect(documentationNote({ workspace, steps: [step("edit_file", { path: "src/components/Button.tsx" }, null)] })).toBe("");
    const updated = documentationNote({ workspace, steps: [step("edit_file", { path: "src/components/Button.tsx" }), step("edit_file", { path: "docs/components/README.md" }), step("edit_file", { path: "CHANGELOG.md" })] });
    expect(updated).toBe("");
  });

  it("only mentions documents the project actually keeps", () => {
    const bare = { ...workspace, files: ["src/components/Button.tsx"] };
    expect(documentationNote({ workspace: bare, steps: [step("edit_file", { path: "src/components/Button.tsx" })] })).toBe("");
  });
});
