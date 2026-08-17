/**
 * PawOS Documentation content model.
 *
 * Replaces docsContent.ts's flat `{heading?, paragraphs[], list?}[]` shape,
 * which had no room for code blocks, tables, ordered steps, or admonitions.
 * A `DocPage` is a sequence of typed `DocBlock`s rendered in order by
 * `DocArticle.tsx` — each block type maps to one real documentation need,
 * not a generic "rich text" escape hatch.
 */

export type DocStatus =
  | 'implemented'
  | 'partial'
  | 'not-implemented'
  | 'not-verified'
  | 'deprecated';

export type DocBlock =
  | { type: 'lead'; text: string }
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'steps'; items: { title: string; detail: string }[] }
  | {
      type: 'code';
      lang: 'ts' | 'tsx' | 'bash' | 'powershell' | 'json' | 'js' | 'python' | 'text';
      code: string;
      filename?: string;
    }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'note'; text: string }
  | { type: 'warning'; text: string }
  | { type: 'tip'; text: string }
  | { type: 'status'; status: DocStatus; text: string }
  | { type: 'faq'; items: { q: string; a: string }[] };

export type DocSectionId =
  | 'getting-started'
  | 'concepts'
  | 'coding'
  | 'autonomous-work'
  | 'connectors'
  | 'companion'
  | 'mobile'
  | 'billing'
  | 'security'
  | 'troubleshooting'
  | 'reference';

export type DocPage = {
  /** Path segment within its section, e.g. "installation" -> /docs/getting-started/installation */
  slug: string;
  section: DocSectionId;
  title: string;
  /** One-sentence subtitle shown under the H1 and used as the search excerpt fallback. */
  description: string;
  /** Extra terms search should match that don't appear verbatim in the title (error strings, aliases). */
  keywords?: string[];
  blocks: DocBlock[];
  /** Other page paths ("section/slug") worth linking at the bottom — never auto-generated. */
  related?: string[];
};

export type DocNavItem = {
  slug: string;
  title: string;
};

export type DocNavSection = {
  id: DocSectionId;
  title: string;
  items: DocNavItem[];
};

export function docPath(section: DocSectionId, slug: string): string {
  return `/docs/${section}/${slug}`;
}
