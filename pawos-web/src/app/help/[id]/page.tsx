import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ALL_ARTICLES, getArticleById } from "../../../lib/helpArticles/articleIndex";
import { HELP_TO_DOCS_REDIRECTS } from "../../../lib/docs/helpRedirects";

export function generateStaticParams() {
  return ALL_ARTICLES.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const article = getArticleById(id);
  if (!article) return {};
  return { title: article.title, description: article.summary };
}

// This corpus's useful substance has been migrated into the new PawOS documentation system
// (see /docs) — every article id now redirects there rather than serving a second, disconnected
// copy of the same information. Articles with no direct migrated equivalent fall back to the docs
// homepage rather than a dead end.
export default async function HelpArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(HELP_TO_DOCS_REDIRECTS[id] ?? '/docs');
}
