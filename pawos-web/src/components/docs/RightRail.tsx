import type { DocBlock } from '../../lib/docs/types';

export function RightRail({ blocks }: { blocks: DocBlock[] }) {
  const headings = blocks.filter((b): b is Extract<DocBlock, { type: 'heading' }> => b.type === 'heading' && b.level === 2);

  // Not forced on short pages — a rail with 0 or 1 entries adds noise, not navigation.
  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-16 hidden max-h-[calc(100vh-4rem)] overflow-y-auto py-6 pl-6 xl:block">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">On this page</p>
      <ul className="mt-3 space-y-2 border-l border-neutral-200 pl-3 text-sm">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className="text-neutral-500 transition hover:text-neutral-900">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
