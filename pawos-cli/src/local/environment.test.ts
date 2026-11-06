import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { analyzeEnvironment, duplicatePathEntries, findOnPath, inspectEnvironment } from "./environment";

describe("environment diagnostics", () => {
  it("detects duplicate PATH entries case-insensitively on Windows", () => {
    expect(duplicatePathEntries(["C:\\Tools", "c:/tools/", "D:\\bin"], "win32")).toEqual(["c:/tools/"]);
  });

  it("finds an executable on the supplied PATH", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pawos-env-"));
    try {
      const executable = path.join(root, process.platform === "win32" ? "probe.exe" : "probe");
      fs.writeFileSync(executable, "probe");
      expect(findOnPath(path.basename(executable), [root])).toBe(executable);
      expect(findOnPath(`pawos-definitely-missing-${Date.now()}.exe`, [root])).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports stale process PATH, scope duplicates, and unset tool homes", () => {
    const warnings = analyzeEnvironment({
      platform: "win32",
      processPath: ["C:\\Windows\\System32"],
      userPath: ["C:\\Tools"],
      machinePath: ["C:\\Tools"],
      current: [{ tool: "java", path: null }],
      freshCmd: [{ tool: "java", path: "C:\\Java\\bin\\java.exe" }],
      freshPowerShell: [],
      candidates: [],
    });
    expect(warnings.some((warning) => warning.includes("differs from"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("duplicate entries"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("resolves differently"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("JAVA_HOME"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("ANDROID_HOME"))).toBe(true);
  });

  it("inspects the real environment without changing it or exposing unrelated variables", async () => {
    const snapshot = await inspectEnvironment();
    expect(snapshot.platform).toBe(process.platform);
    expect(snapshot.current.length).toBeGreaterThan(0);
    expect(snapshot.warnings.every((warning) => typeof warning === "string")).toBe(true);
    if (process.platform === "win32") {
      expect(snapshot.freshCmd).toHaveLength(snapshot.current.length);
      expect(snapshot.freshPowerShell).toHaveLength(snapshot.current.length);
    } else {
      expect(snapshot.freshCmd).toBeNull();
      expect(snapshot.freshPowerShell).toBeNull();
    }
    expect(JSON.stringify(snapshot)).not.toMatch(/API[_-]?KEY|ACCESS[_-]?TOKEN|CLIENT[_-]?SECRET/i);
  }, 20_000);
});
