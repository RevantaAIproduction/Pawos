import type { CliContext } from "../context";
import { DEVELOPMENT_TOOLS, inspectEnvironment } from "../local/environment";
import { secretValues } from "../local/process";
import { blank, clean, line, seg, type Line } from "../ui/terminal";

export const ENVIRONMENT_USAGE = "/env [node|npm|git|python|java|javac|adb|sdkmanager]";
const safe = (value: string): string => secretValues().reduce((text, secret) => text.split(secret).join("[redacted]"), value);

export async function environmentLines(filter?: string): Promise<Line[]> {
  const requested = filter?.trim().toLowerCase();
  const valid = DEVELOPMENT_TOOLS.some((tool) => tool.id === requested || ("aliases" in tool && tool.aliases.includes(requested as never)));
  if (requested && !valid) return [blank(), line("  ", seg(`Use ${ENVIRONMENT_USAGE}.`, "muted")), blank()];
  const snapshot = await inspectEnvironment(requested);
  const current = new Map(snapshot.current.map((tool) => [tool.tool, tool.path]));
  const cmd = new Map(snapshot.freshCmd?.map((tool) => [tool.tool, tool.path]) ?? []);
  const powershell = new Map(snapshot.freshPowerShell?.map((tool) => [tool.tool, tool.path]) ?? []);
  const output: Line[] = [blank(), line("  ", seg("Development environment (read only)", "strong")), blank()];
  for (const tool of DEVELOPMENT_TOOLS.filter((entry) => !requested || entry.id === requested || ("aliases" in entry && entry.aliases.includes(requested as never)))) {
    const found = current.get(tool.id);
    output.push(line("  ", seg(tool.id.padEnd(12), "strong"), found ? clean(safe(found), 260) : seg("not found on current PATH", "warn")));
    if (snapshot.platform === "win32") {
      output.push(line("    ", seg("CMD: ", "muted"), clean(safe(cmd.get(tool.id) ?? "not found"), 240), seg("  PowerShell: ", "muted"), clean(safe(powershell.get(tool.id) ?? "not found"), 240)));
    }
  }
  output.push(
    blank(),
    line("  ", seg("JAVA_HOME: ", "muted"), clean(safe(snapshot.javaHome || "not set"), 240)),
    line("  ", seg("ANDROID_HOME: ", "muted"), clean(safe(snapshot.androidHome || "not set"), 240)),
    line("  ", seg("ANDROID_SDK_ROOT: ", "muted"), clean(safe(snapshot.androidSdkRoot || "not set"), 240))
  );
  if (snapshot.warnings.length) {
    output.push(blank(), line("  ", seg("Findings", "strong")), ...snapshot.warnings.map((warning) => line("  ", seg("• ", "warn"), clean(safe(warning), 500))));
  } else output.push(blank(), line("  ", seg("No PATH or Java/Android configuration issues detected by these checks.", "good")));
  output.push(blank(), line("  ", seg("PATH scope values are inspected without printing unrelated environment variables.", "muted")), blank());
  return output;
}

export async function runEnvironmentCommand(ctx: CliContext, argument = ""): Promise<void> {
  ctx.term.print(await environmentLines(argument));
}
