import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
import { ALL_ARTICLES, CATEGORY_LABELS, getArticleById } from "../../../lib/helpArticles/articleIndex";

export function generateStaticParams() {
  return ALL_ARTICLES.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = getArticleById(id);
  if (!article) return {};
  return { title: article.title, description: article.summary };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticleById(id);
  if (!article) notFound();

  const related = article.relatedArticleIds.map((rid) => getArticleById(rid)).filter(Boolean);

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ label: "Knowledge Base", href: "/knowledge-base" }, { label: CATEGORY_LABELS[article.category] }, { label: article.title }]} />
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{CATEGORY_LABELS[article.category]}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-4 text-neutral-400">{article.summary}</p>
        {article.roadmap && (
          <p className="mt-4 inline-block rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-400">
            Coming Soon
          </p>
        )}

        <div className="mt-10 space-y-10">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Overview</h2>
            <p className="mt-3 text-neutral-400">{article.overview}</p>
          </div>

          {article.features.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Features</h2>
              <ul className="mt-3 space-y-2 text-neutral-400">
                {article.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-neutral-100">How it works</h2>
            <p className="mt-3 text-neutral-400">{article.howItWorks}</p>
          </div>

          {article.bestPractices.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Best practices</h2>
              <ul className="mt-3 space-y-2 text-neutral-400">
                {article.bestPractices.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            </div>
          )}

          {article.examples.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Examples</h2>
              <div className="mt-4 space-y-6">
                {article.examples.map((ex) => (
                  <div key={ex.title}>
                    <h3 className="font-medium text-neutral-200">{ex.title}</h3>
                    <ol className="mt-2 space-y-1.5 text-neutral-400">
                      {ex.steps.map((step, i) => (
                        <li key={i}>
                          {i + 1}. {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}

          {article.troubleshooting.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Troubleshooting</h2>
              <ul className="mt-3 space-y-2 text-neutral-400">
                {article.troubleshooting.map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </div>
          )}

          {article.requirements.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Requirements</h2>
              <ul className="mt-3 space-y-2 text-neutral-400">
                {article.requirements.map((r) => (
                  <li key={r}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {article.permissions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Permissions</h2>
              <ul className="mt-3 space-y-2 text-neutral-400">
                {article.permissions.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </div>
          )}

          {article.administration && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Administration</h2>
              <p className="mt-3 text-neutral-400">{article.administration}</p>
            </div>
          )}

          {article.billing && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">Billing</h2>
              <p className="mt-3 text-neutral-400">{article.billing}</p>
            </div>
          )}

          {article.faq.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">FAQ</h2>
              <div className="mt-4 space-y-5">
                {article.faq.map((f) => (
                  <div key={f.question}>
                    <p className="font-medium text-neutral-200">{f.question}</p>
                    <p className="mt-1.5 text-neutral-400">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {related.length > 0 && (
          <div className="mt-12 border-t border-neutral-900 pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Related</h3>
            <ul className="mt-4 space-y-2">
              {related.map((a) => (
                <li key={a!.id}>
                  <Link href={`/help/${a!.id}`} className="text-blue-400 hover:underline">
                    {a!.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-12 flex flex-wrap gap-4 border-t border-neutral-900 pt-8 text-sm">
          <Link href="/knowledge-base" className="text-neutral-500 hover:text-neutral-300">
            ← Knowledge Base
          </Link>
          <Link href="/support" className="text-neutral-500 hover:text-neutral-300">
            Still stuck? Contact support →
          </Link>
        </div>
      </div>
    </Section>
  );
}
