import Link from "next/link";
import type { ReactNode } from "react";

export function FeatureCard({
  title,
  body,
  href,
  icon,
}: {
  title: string;
  body: string;
  href?: string;
  icon?: ReactNode;
}) {
  const content = (
    <div className="group h-full rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 transition hover:border-neutral-700 hover:bg-neutral-900">
      {icon && <div className="mb-3 text-blue-400">{icon}</div>}
      <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{body}</p>
      {href && (
        <span className="mt-4 inline-block text-sm font-medium text-blue-400 group-hover:text-blue-300">
          Learn more →
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl">
        {content}
      </Link>
    );
  }
  return content;
}
