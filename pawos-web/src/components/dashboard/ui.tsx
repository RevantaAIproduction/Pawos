import type { ReactNode } from "react";

/** Shared, presentational pieces for the dashboard pages — existing PawOS dark tokens only. */

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-neutral-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm text-neutral-400">{children}</h2>;
}

/** The small plain heading that sits above a panel ("Profile", "Source control", …). */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <h2 className="text-sm font-medium text-neutral-300">{children}</h2>
      {action}
    </div>
  );
}

/** A bordered list of rows. Put <Row> elements (or any block children) inside. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-neutral-800/80 overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/40 ${className}`}>{children}</div>;
}

/** One settings-style row: label (and optional help text) on the left, value or control on the right. */
export function Row({ label, hint, children, align = "center" }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; align?: "center" | "start" }) {
  return (
    <div className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-5 ${align === "center" ? "sm:items-center" : "sm:items-start"}`}>
      <div className="min-w-0 sm:w-2/5">
        <div className="text-sm font-medium text-neutral-100">{label}</div>
        {hint && <div className="mt-0.5 text-sm text-neutral-400">{hint}</div>}
      </div>
      {children !== undefined && <div className="min-w-0 sm:flex sm:w-3/5 sm:justify-end">{children}</div>}
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60";
export const dangerButton =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60";
export const inputClasses =
  "w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none transition-colors";
