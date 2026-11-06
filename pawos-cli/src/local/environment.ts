import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { childEnvironment } from "./process";

const execFileAsync = promisify(execFile);

export const DEVELOPMENT_TOOLS = [
  { id: "node", executable: "node", versionArgs: ["--version"] },
  { id: "npm", executable: "npm", versionArgs: ["--version"] },
  { id: "git", executable: "git", versionArgs: ["--version"] },
  { id: "python", executable: "python", aliases: ["python3", "py"], versionArgs: ["--version"] },
  { id: "java", executable: "java", versionArgs: ["-version"] },
  { id: "javac", executable: "javac", versionArgs: ["-version"] },
  { id: "adb", executable: "adb", versionArgs: ["version"] },
  { id: "sdkmanager", executable: "sdkmanager", versionArgs: ["--version"] },
] as const;

export interface EnvironmentSnapshot {
  platform: string;
  processPath: string[];
  userPath: string[] | null;
  machinePath: string[] | null;
  javaHome: string;
  androidHome: string;
  androidSdkRoot: string;
  current: Array<{ tool: string; path: string | null }>;
  freshCmd: Array<{ tool: string; path: string | null }> | null;
  freshPowerShell: Array<{ tool: string; path: string | null }> | null;
  warnings: string[];
}

export interface RegistryEnvironment {
  userPath?: string;
  machinePath?: string;
  userJavaHome?: string;
  machineJavaHome?: string;
  userAndroidHome?: string;
  machineAndroidHome?: string;
}

const parts = (value: string | undefined, platform = process.platform): string[] => (value ?? "").split(platform === "win32" ? ";" : path.delimiter).map((entry) => entry.trim()).filter(Boolean);
const normalized = (value: string, platform: string = process.platform): string => {
  const clean = (platform === "win32" ? path.win32 : path).normalize(value.trim().replace(/[\\/]+$/, ""));
  return platform === "win32" ? clean.toLowerCase() : clean;
};

export function duplicatePathEntries(entries: string[], platform: string = process.platform): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) {
    const key = normalized(entry, platform);
    if (seen.has(key)) duplicates.add(entry);
    seen.add(key);
  }
  return [...duplicates];
}

function candidateNames(executable: string, platform = process.platform, pathext = process.env.PATHEXT): string[] {
  if (platform !== "win32") return [executable];
  const extensions = (pathext || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return path.extname(executable) ? [executable] : extensions.map((extension) => `${executable}${extension.toLowerCase()}`);
}

export function findOnPath(executable: string, entries: string[], platform = process.platform): string | null {
  for (const directory of entries) {
    if (!directory || directory.includes("%")) continue;
    for (const name of candidateNames(executable, platform)) {
      const candidate = path.join(directory, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Keep checking PATH entries.
      }
    }
  }
  return null;
}

async function readWindowsEnvironment(): Promise<RegistryEnvironment | null> {
  if (process.platform !== "win32") return null;
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "$m=[Environment]::GetEnvironmentVariables('Machine')",
    "$u=[Environment]::GetEnvironmentVariables('User')",
    "[ordered]@{machinePath=[string]$m['Path'];userPath=[string]$u['Path'];machineJavaHome=[string]$m['JAVA_HOME'];userJavaHome=[string]$u['JAVA_HOME'];machineAndroidHome=[string]$m['ANDROID_HOME'];userAndroidHome=[string]$u['ANDROID_HOME']}|ConvertTo-Json -Compress",
  ].join(";");
  try {
    const result = await execFileAsync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10_000, windowsHide: true, maxBuffer: 64_000 });
    const raw = JSON.parse(result.stdout.trim()) as RegistryEnvironment;
    return raw;
  } catch {
    return null;
  }
}

function expandPercentVariables(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => {
    const key = Object.keys(process.env).find((entry) => entry.toLowerCase() === name.toLowerCase());
    return key ? process.env[key] ?? match : match;
  });
}

async function resolveFresh(shell: "cmd" | "powershell", executable: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  try {
    if (shell === "cmd") {
      const { stdout } = await execFileAsync("cmd.exe", ["/d", "/s", "/c", `where.exe ${executable}`], { timeout: 8_000, windowsHide: true, maxBuffer: 16_000 });
      return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
    }
    const script = "$c=Get-Command $env:PawosProbe -ErrorAction SilentlyContinue;if($c){$c.Source}";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 16_000,
      env: { ...childEnvironment(), PawosProbe: executable },
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function likelyToolDirectories(): Array<{ label: string; directory: string; executable: string }> {
  if (process.platform !== "win32") return [];
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const app = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const java = process.env.JAVA_HOME || process.env.JDK_HOME || "";
  const android = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(local, "Android", "Sdk");
  return [
    { label: "Node.js", directory: path.join(programFiles, "nodejs"), executable: "node.exe" },
    { label: "npm global commands", directory: path.join(app, "npm"), executable: "npm.cmd" },
    { label: "Git", directory: path.join(programFiles, "Git", "cmd"), executable: "git.exe" },
    { label: "Java", directory: java ? path.join(java, "bin") : "", executable: "java.exe" },
    { label: "Android platform tools", directory: path.join(android, "platform-tools"), executable: "adb.exe" },
    { label: "Android command-line tools", directory: path.join(android, "cmdline-tools", "latest", "bin"), executable: "sdkmanager.bat" },
  ].filter((entry) => entry.directory);
}

export function analyzeEnvironment(input: {
  platform: string;
  processPath: string[];
  userPath?: string[] | null;
  machinePath?: string[] | null;
  current: Array<{ tool: string; path: string | null }>;
  freshCmd?: Array<{ tool: string; path: string | null }> | null;
  freshPowerShell?: Array<{ tool: string; path: string | null }> | null;
  javaHome?: string;
  androidHome?: string;
  androidSdkRoot?: string;
  candidates?: Array<{ label: string; directory: string; executable: string }>;
}): string[] {
  const warnings: string[] = [];
  const duplicate = duplicatePathEntries(input.processPath, input.platform);
  if (duplicate.length) warnings.push(`Current process PATH has duplicate entries: ${duplicate.join("; ")}`);
  const present = new Set(input.processPath.map((entry) => normalized(expandPercentVariables(entry), input.platform)));
  for (const candidate of input.candidates ?? []) {
    if (fs.existsSync(path.join(candidate.directory, candidate.executable)) && !present.has(normalized(candidate.directory, input.platform))) {
      warnings.push(`${candidate.label} appears installed at ${candidate.directory}, but that directory is absent from the current process PATH.`);
    }
  }
  if (input.platform === "win32" && input.userPath && input.machinePath) {
    const expected = [...input.machinePath, ...input.userPath].map((entry) => normalized(expandPercentVariables(entry), input.platform));
    const current = input.processPath.map((entry) => normalized(expandPercentVariables(entry), input.platform));
    const missing = expected.filter((entry) => !current.includes(entry));
    if (missing.length) warnings.push("Current process PATH differs from the current User/Machine PATH values; open a fresh terminal after environment changes.");
    if (duplicatePathEntries([...input.machinePath, ...input.userPath], input.platform).length) warnings.push("User and Machine PATH contain duplicate entries.");
  }
  const fresh = [...(input.freshCmd ?? []), ...(input.freshPowerShell ?? [])];
  for (const current of input.current) {
    const shellResults = fresh.filter((entry) => entry.tool === current.tool);
    if (shellResults.some((entry) => Boolean(entry.path) !== Boolean(current.path))) {
      warnings.push(`${current.tool} resolves differently in the current process and a fresh CMD/PowerShell session.`);
    }
  }
  if (!input.javaHome) warnings.push("JAVA_HOME is not set in this process.");
  if (!input.androidHome && !input.androidSdkRoot) warnings.push("ANDROID_HOME and ANDROID_SDK_ROOT are not set in this process.");
  return warnings;
}

export async function inspectEnvironment(toolFilter?: string): Promise<EnvironmentSnapshot> {
  const registry = await readWindowsEnvironment();
  const currentEntries = parts(process.env.PATH);
  const userPath = registry?.userPath === undefined ? null : parts(registry.userPath, "win32");
  const machinePath = registry?.machinePath === undefined ? null : parts(registry.machinePath, "win32");
  const selected = DEVELOPMENT_TOOLS.filter((tool) => !toolFilter || tool.id === toolFilter.toLowerCase() || ("aliases" in tool && tool.aliases.includes(toolFilter.toLowerCase() as never)));
  const probes = selected.map((tool) => ({ tool: tool.id, path: findOnPath(tool.executable, currentEntries) ?? ("aliases" in tool ? tool.aliases.map((alias) => findOnPath(alias, currentEntries)).find(Boolean) ?? null : null) }));
  const [freshCmd, freshPowerShell] = process.platform === "win32" ? await Promise.all([
    Promise.all(selected.map(async (tool) => ({ tool: tool.id, path: await resolveFresh("cmd", tool.executable) }))),
    Promise.all(selected.map(async (tool) => ({ tool: tool.id, path: await resolveFresh("powershell", tool.executable) }))),
  ]) : [null, null];
  const androidHome = process.env.ANDROID_HOME ?? registry?.userAndroidHome ?? registry?.machineAndroidHome ?? "";
  const javaHome = process.env.JAVA_HOME ?? registry?.userJavaHome ?? registry?.machineJavaHome ?? "";
  const warnings = analyzeEnvironment({
    platform: process.platform,
    processPath: currentEntries,
    userPath,
    machinePath,
    current: probes,
    freshCmd,
    freshPowerShell,
    javaHome: process.env.JAVA_HOME,
    androidHome: process.env.ANDROID_HOME,
    androidSdkRoot: process.env.ANDROID_SDK_ROOT,
    candidates: likelyToolDirectories(),
  });
  return {
    platform: process.platform,
    processPath: currentEntries,
    userPath,
    machinePath,
    javaHome,
    androidHome,
    androidSdkRoot: process.env.ANDROID_SDK_ROOT ?? "",
    current: probes,
    freshCmd,
    freshPowerShell,
    warnings,
  };
}
