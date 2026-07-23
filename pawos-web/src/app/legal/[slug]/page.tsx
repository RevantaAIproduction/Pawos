import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { DraftBanner } from "../../../components/legal/DraftBanner";
import { LEGAL_DOCS, getLegalDocBySlug } from "../../../lib/legalContent";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDocBySlug(slug);
  if (!doc) return {};
  return { title: doc.title, description: doc.summary };
}

export default async function LegalDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getLegalDocBySlug(slug);
  if (!doc) notFound();

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{doc.category}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-4 text-neutral-400">{doc.summary}</p>

        <div className="mt-8">
          <DraftBanner />
        </div>

        <div className="space-y-8">
          {doc.sections.map((section, i) => (
            <div key={`${section.heading}-${i}`}>
              <h2 className="text-lg font-semibold text-neutral-100">{section.heading}</h2>
              {section.paragraphs.map((p, pi) => (
                <p key={pi} className="mt-3 text-neutral-400">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        <Link href="/legal" className="mt-12 inline-block text-sm text-neutral-500 hover:text-neutral-300">
          ← All legal documents
        </Link>
      </div>
    </Section>
  );
}
