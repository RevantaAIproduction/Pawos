import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "amber" | "green";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
