import Link from 'next/link';
import { getDocPageByPath } from '../../lib/docs/registry';

export function RelatedDocs({ paths }: { paths: string[] }) {
  const pages = paths.map((p) => ({ path: p, page: getDocPageByPath(p) })).filter((e) => e.page);
  if (pages.length === 0) return null;

  return (
    <div className="mt-12 border-t border-neutral-200 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Related</p>
      <ul className="mt-3 space-y-2">
        {pages.map(({ path, page }) => (
          <li key={path}>
            <Link href={`/docs/${path}`} className="text-sm font-medium text-neutral-700 hover:text-neutral-950 hover:underline">
              {page!.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
