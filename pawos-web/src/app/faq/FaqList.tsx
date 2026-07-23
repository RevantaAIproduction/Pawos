"use client";

import { useMemo, useState } from "react";
import type { FaqItem } from "../../lib/faqContent";

export function FaqList({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.q} ${i.a} ${i.category}`.toLowerCase().includes(q));
  }, [query, items]);

  return (
    <div>
      <div className="mx-auto max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FAQ…"
          aria-label="Search FAQ"
          className="w-full rounded-full border border-neutral-800 bg-neutral-900/50 px-5 py-3 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="mx-auto mt-10 max-w-2xl space-y-10">
        {categories.map((category) => {
          const categoryItems = filtered.filter((i) => i.category === category);
          if (categoryItems.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{category}</h2>
              <div className="mt-4 divide-y divide-neutral-900">
                {categoryItems.map((item) => (
                  <details key={item.q} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-left font-medium text-neutral-100">
                      {item.q}
                      <span className="ml-4 text-neutral-500 transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-3 text-sm text-neutral-400">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
        {query && filtered.length === 0 && <p className="text-center text-sm text-neutral-500">No results for &ldquo;{query}&rdquo;.</p>}
      </div>
    </div>
  );
}
