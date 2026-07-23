import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { DOCS, getDocBySlug } from "../../../lib/docsContent";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return {};
  return { title: doc.title, description: doc.summary };
}

export default async function DocDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const related = (doc.related ?? []).map((s) => DOCS.find((d) => d.slug === s)).filter(Boolean);

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{doc.category}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-4 text-neutral-400">{doc.summary}</p>

        <div className="mt-10 space-y-8">
          {doc.body.map((section, i) => (
            <div key={section.heading ?? i}>
              {section.heading && <h2 className="text-lg font-semibold text-neutral-100">{section.heading}</h2>}
              {section.paragraphs.map((p, pi) => (
                <p key={pi} className="mt-3 text-neutral-400">
                  {p}
                </p>
              ))}
              {section.list && section.list.length > 0 && (
                <ul className="mt-3 space-y-2 text-neutral-400">
                  {section.list.map((li) => (
                    <li key={li}>• {li}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <div className="mt-12 border-t border-neutral-900 pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Related</h3>
            <ul className="mt-4 space-y-2">
              {related.map((d) => (
                <li key={d!.slug}>
                  <Link href={`/docs/${d!.slug}`} className="text-blue-400 hover:underline">
                    {d!.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link href="/docs" className="mt-12 inline-block text-sm text-neutral-500 hover:text-neutral-300">
          ← All documentation
        </Link>
      </div>
    </Section>
  );
}
