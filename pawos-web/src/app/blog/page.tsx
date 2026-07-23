import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { ARTICLES } from "../../lib/articlesContent";

export const metadata: Metadata = {
  title: "Blog",
  description: "Educational articles about PawOS, desktop AI, autonomous engineering, and how the product is built.",
};

export default function BlogIndexPage() {
  return (
    <Section title="Blog" subtitle="Educational writing about how PawOS works and why — not marketing copy.">
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ARTICLES.map((a) => (
          <Link key={a.slug} href={`/blog/${a.slug}`} className="rounded-xl border border-neutral-800 p-6 hover:border-neutral-700 hover:bg-neutral-900/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">{a.category}</p>
            <h2 className="mt-2 font-semibold text-neutral-100">{a.title}</h2>
            <p className="mt-2 text-sm text-neutral-400">{a.excerpt}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}
