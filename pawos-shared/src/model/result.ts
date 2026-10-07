import type { ChecksState, CodeChange } from "../api/types";

/** How a change's checks are described to the user. PawOS reports one overall state, not a list. */
export function describeChecks(change: Pick<CodeChange, "checksState" | "state" | "fixAttempts">, stillWatching: boolean): string {
  const fixed = change.fixAttempts > 0 ? ` (PawOS made ${change.fixAttempts} automatic ${change.fixAttempts === 1 ? "fix" : "fixes"})` : "";
  if (change.state === "fixing") return "A check failed — PawOS is fixing it…";
  const labels: Record<ChecksState, string> = {
    pending: stillWatching ? "Waiting for your repository's checks…" : "Still running — see GitHub for the result",
    success: `Passed${fixed}`,
    failure: `Failed${fixed}`,
    none: "No checks or preview deployments reported",
  };
  return labels[change.checksState] ?? "Unknown";
}

/** Only https links are ever opened or printed as links. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
