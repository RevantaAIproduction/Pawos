import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ALL_DOC_PAGES, getDocPage, sectionTitle } from '../../../lib/docs/registry';
import { LEGACY_DOC_REDIRECTS } from '../../../lib/docs/legacyRedirects';
import { findNavSection } from '../../../lib/docs/navigation';
import { DocsBreadcrumbs } from '../../../components/docs/DocsBreadcrumbs';
import { DocArticle } from '../../../components/docs/DocArticle';
import { RightRail } from '../../../components/docs/RightRail';
import { RelatedDocs } from '../../../components/docs/RelatedDocs';

export function generateStaticParams() {
  return ALL_DOC_PAGES.map((p) => ({ slug: [p.section, p.slug] }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const [section, pageSlug] = slug;
  if (!section || !pageSlug) return {};
  const page = getDocPage(section, pageSlug);
  if (!page) return {};
  return { title: page.title, description: page.description };
}

export default async function DocPageRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const [section, pageSlug, ...rest] = slug;

  // Legacy flat/runtime slugs -> new section/slug path, so a previously-shared link never 404s.
  if (rest.length === 0 && section && !pageSlug) {
    const target = LEGACY_DOC_REDIRECTS[section];
    if (target) redirect(target);
  }
  if (rest.length === 0 && section && pageSlug) {
    const legacyKey = section === 'runtimes' ? `runtimes/${pageSlug}` : null;
    if (legacyKey && LEGACY_DOC_REDIRECTS[legacyKey]) redirect(LEGACY_DOC_REDIRECTS[legacyKey]);
  }

  if (!section || !pageSlug || rest.length > 0) notFound();

  const page = getDocPage(section, pageSlug);
  if (!page) notFound();

  // Sections have no dedicated index page in this IA — the breadcrumb's section crumb links to
  // that section's first sidebar entry, the closest real thing to a section landing page.
  const navSection = findNavSection(page.section);
  const firstItem = navSection?.items[0];

  return (
    <div className="flex">
      <main className="min-w-0 flex-1 px-6 py-8 sm:px-10 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <DocsBreadcrumbs
            items={[
              { label: 'PawOS Docs', href: '/docs' },
              firstItem ? { label: sectionTitle(page.section), href: `/docs/${page.section}/${firstItem.slug}` } : { label: sectionTitle(page.section) },
              { label: page.title },
            ]}
          />
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">{page.title}</h1>
          <p className="mt-2 text-base text-neutral-500">{page.description}</p>

          <DocArticle blocks={page.blocks} />

          {page.related && page.related.length > 0 && <RelatedDocs paths={page.related} />}
        </div>
      </main>
      <RightRail blocks={page.blocks} />
    </div>
  );
}
