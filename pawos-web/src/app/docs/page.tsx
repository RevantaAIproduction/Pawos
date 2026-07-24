import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { DOCS, type DocCategory } from "../../lib/docsContent";
import { RUNTIMES } from "../../lib/runtimesContent";
import { DocsSearch } from "./DocsSearch";

export const metadata: Metadata = {
  title: "Documentation",
  description: "PawOS documentation: getting started, runtimes, configuration, billing, enterprise, and reference material.",
};

const CATEGORY_ORDER: DocCategory[] = [
  "Getting Started",
  "AI Models",
  "Companion",
  "Collaboration",
  "Configuration",
  "Billing & Enterprise",
  "Operations",
  "Reference",
];

export default function DocsPage() {
  return (
    <>
      <Section title="Documentation" subtitle="Everything you need to install, configure, and get real work done with PawOS.">
        <div className="mt-10">
          <DocsSearch docs={DOCS} runtimes={RUNTIMES} />
        </div>
      </Section>

      <Section eyebrow="Runtimes" title="How each runtime works" className="border-t border-neutral-900">
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RUNTIMES.map((r) => (
            <Link key={r.slug} href={`/docs/runtimes/${r.slug}`} className="rounded-xl border border-neutral-800 p-5 hover:border-neutral-700 hover:bg-neutral-900/50">
              <h3 className="font-semibold text-neutral-100">{r.name}</h3>
              <p className="mt-2 text-sm text-neutral-400">{r.purpose}</p>
            </Link>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link href="/docs/autonomous-ticket-resolution" className="text-sm font-medium text-blue-400 hover:underline">
            Deep dive: Autonomous Ticket Resolution →
          </Link>
        </div>
      </Section>

      <Section eyebrow="Guides" title="Everything else" className="border-t border-neutral-900">
        <div className="mt-8 space-y-12">
          {CATEGORY_ORDER.map((category) => {
            const items = DOCS.filter((d) => d.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{category}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((d) => (
                    <Link key={d.slug} href={`/docs/${d.slug}`} className="rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900/50">
                      <p className="font-medium text-neutral-100">{d.title}</p>
                      <p className="mt-1 text-neutral-500">{d.summary}</p>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
