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
  | { type: 'faq'; items: { q: string; a: string }[] }
  /** Side-by-side summaries (they stack on a phone) — e.g. the ways to use PawOS. */
  | { type: 'cards'; items: { title: string; subtitle: string; detail: string; points: string[] }[] }
  /** One sentence and one link out. `href` must be https. */
  | { type: 'cta'; text: string; label: string; href: string }
  /** A real screenshot of PawOS, or a labelled slot where one goes when `shot.src` is null. */
  | { type: 'screenshot'; shot: DocScreenshot };

/**
 * A screenshot shown in a doc page. `src` is a path under /public (for example "/docs/pawos-web.png");
 * with `src: null` the page shows a labelled slot of the same shape instead, so the layout holds
 * before the image exists. Only real captures of PawOS belong here — never a mock-up.
 */
export type DocScreenshot = {
  /** The slot's name, shown in the placeholder: WEB_SCREENSHOT, CLI_SCREENSHOT, … */
  slot: string;
  src: string | null;
  /** The image's own size in pixels (it sets the shape; the image scales to the page). */
  width: number;
  height: number;
  alt: string;
  caption: string;
  /** A phone-shaped capture: shown narrow and centred instead of full width. */
  portrait?: boolean;
};

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
