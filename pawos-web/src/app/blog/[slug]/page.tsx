import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
import { ARTICLES, getArticleBySlug } from "../../../lib/articlesContent";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};
  return { title: article.title, description: article.excerpt };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <Section>
      <article className="mx-auto max-w-2xl">
        <Breadcrumbs items={[{ label: "Blog", href: "/blog" }, { label: article.title }]} />
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{article.category}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-4 text-lg text-neutral-400">{article.excerpt}</p>
        <div className="mt-10 space-y-5">
          {article.body.map((p, i) => (
            <p key={i} className="text-neutral-300 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
        <Link href="/blog" className="mt-12 inline-block text-sm text-neutral-500 hover:text-neutral-300">
          ← All articles
        </Link>
      </article>
    </Section>
  );
}
