import Link from 'next/link';

export function DocsBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-neutral-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-neutral-300">
                /
              </span>
            )}
            {item.href ? (
              <Link href={item.href} className="transition hover:text-neutral-900">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-neutral-700">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
