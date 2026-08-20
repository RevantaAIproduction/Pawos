import type { DocPage, DocSectionId } from './types';
import { DOC_NAV } from './navigation';
import { gettingStartedPages } from './content/gettingStarted';
import { conceptsPages } from './content/concepts';
import { codingPages } from './content/coding';
import { autonomousWorkPages } from './content/autonomousWork';
import { connectorsPages } from './content/connectors';
import { companionPages } from './content/companion';
import { mobilePages } from './content/mobile';
import { billingPages } from './content/billing';
import { securityPages } from './content/security';
import { troubleshootingPages } from './content/troubleshooting';
import { referencePages } from './content/reference';
import { addDisclosureBlocks } from './disclosure';

const RAW_DOC_PAGES: DocPage[] = [
  ...gettingStartedPages,
  ...conceptsPages,
  ...codingPages,
  ...autonomousWorkPages,
  ...connectorsPages,
  ...companionPages,
  ...mobilePages,
  ...billingPages,
  ...securityPages,
  ...troubleshootingPages,
  ...referencePages,
];

export const ALL_DOC_PAGES: DocPage[] = RAW_DOC_PAGES.map(addDisclosureBlocks);

const PAGE_MAP = new Map<string, DocPage>(ALL_DOC_PAGES.map((p) => [`${p.section}/${p.slug}`, p]));

export function getDocPage(section: string, slug: string): DocPage | undefined {
  return PAGE_MAP.get(`${section}/${slug}`);
}

export function getDocPageByPath(path: string): DocPage | undefined {
  return PAGE_MAP.get(path);
}

export function sectionTitle(id: DocSectionId): string {
  return DOC_NAV.find((s) => s.id === id)?.title ?? id;
}

// Every nav entry must resolve to a real page, and every page must belong to a real nav
// section — checked once at module load (dev/build time) so a missing page becomes a build
// failure, never a silent 404 discovered by a user clicking a sidebar link.
if (process.env.NODE_ENV !== 'production') {
  for (const section of DOC_NAV) {
    for (const item of section.items) {
      if (!PAGE_MAP.has(`${section.id}/${item.slug}`)) {
        throw new Error(`Docs navigation references missing page: ${section.id}/${item.slug}`);
      }
    }
  }
  for (const page of ALL_DOC_PAGES) {
    const navSection = DOC_NAV.find((s) => s.id === page.section);
    if (!navSection || !navSection.items.some((i) => i.slug === page.slug)) {
      throw new Error(`Doc page ${page.section}/${page.slug} has no navigation entry`);
    }
  }
}

export type SearchableEntry = {
  path: string;
  section: DocSectionId;
  sectionTitle: string;
  title: string;
  description: string;
  /** Flattened searchable text: headings + paragraph/list/step/faq text + keywords. */
  body: string;
};

function blockText(block: DocPage['blocks'][number]): string {
  switch (block.type) {
    case 'lead':
    case 'paragraph':
    case 'note':
    case 'warning':
    case 'tip':
    case 'status':
      return block.text;
    case 'heading':
      return block.text;
    case 'list':
      return block.items.join(' ');
    case 'steps':
      return block.items.map((i) => `${i.title} ${i.detail}`).join(' ');
    case 'table':
      return [block.headers.join(' '), ...block.rows.map((r) => r.join(' '))].join(' ');
    case 'code':
      return block.code;
    case 'faq':
      return block.items.map((i) => `${i.q} ${i.a}`).join(' ');
    default:
      return '';
  }
}

export function buildSearchIndex(): SearchableEntry[] {
  return ALL_DOC_PAGES.map((page) => ({
    path: `${page.section}/${page.slug}`,
    section: page.section,
    sectionTitle: sectionTitle(page.section),
    title: page.title,
    description: page.description,
    body: [page.description, ...(page.keywords ?? []), ...page.blocks.map(blockText)].join(' \n '),
  }));
}
