import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { DraftBanner } from "../../components/legal/DraftBanner";
import { LEGAL_DOCS, type LegalDoc } from "../../lib/legalContent";

export const metadata: Metadata = { title: "Legal", description: "All PawOS legal documents." };

const CATEGORY_ORDER: LegalDoc["category"][] = ["Core", "Payments", "Safety", "Security", "Intellectual Property", "Enterprise", "Compliance"];

export default function LegalIndexPage() {
  return (
    <Section title="Legal" subtitle="Every PawOS legal document in one place.">
      <div className="mx-auto mt-8 max-w-2xl">
        <DraftBanner />
      </div>
      <div className="mt-4 space-y-10">
        {CATEGORY_ORDER.map((category) => {
          const docs = LEGAL_DOCS.filter((d) => d.category === category);
          if (docs.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{category}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((d) => (
                  <Link key={d.slug} href={`/legal/${d.slug}`} className="rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900/50">
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
  );
}
