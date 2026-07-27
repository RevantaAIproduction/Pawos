import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
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

  const related = doc.related.map((s) => getLegalDocBySlug(s)).filter(Boolean);

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ label: "Legal", href: "/legal" }, { label: doc.title }]} />
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{doc.category}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-4 text-neutral-400">{doc.summary}</p>
        <p className="mt-3 text-sm text-neutral-500">Last updated: {doc.lastUpdated}</p>

        <div className="mt-10 space-y-8">
          {doc.sections.map((section, i) => (
            <div key={`${section.heading}-${i}`}>
              <h2 className="text-lg font-semibold text-neutral-100">
                {i + 1}. {section.heading}
              </h2>
              {section.paragraphs.map((p, pi) => (
                <p key={pi} className="mt-3 text-neutral-400">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <div className="mt-12 border-t border-neutral-900 pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Related documents</h3>
            <ul className="mt-4 space-y-2">
              {related.map((d) => (
                <li key={d!.slug}>
                  <Link href={`/legal/${d!.slug}`} className="text-blue-400 hover:underline">
                    {d!.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/legal" className="mt-12 inline-block text-sm text-neutral-500 hover:text-neutral-300">
          ← All legal documents
        </Link>
      </div>
    </Section>
  );
}
