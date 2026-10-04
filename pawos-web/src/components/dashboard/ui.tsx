import type { ReactNode } from "react";

/** Shared, presentational pieces for the dashboard pages — existing PawOS dark tokens only. */

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-neutral-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-medium text-neutral-400">{children}</h2>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{children}</h2>;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export const primaryButton =
  "inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60";
export const secondaryButton =
  "inline-flex items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60";
export const inputClasses =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors";
