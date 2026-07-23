"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DocPage } from "../../lib/docsContent";
import type { RuntimeDoc } from "../../lib/runtimesContent";

export function DocsSearch({ docs, runtimes }: { docs: DocPage[]; runtimes: RuntimeDoc[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const docMatches = docs.filter((d) => `${d.title} ${d.summary}`.toLowerCase().includes(q));
    const runtimeMatches = runtimes.filter((r) => `${r.name} ${r.purpose}`.toLowerCase().includes(q));
    return { docMatches, runtimeMatches };
  }, [query, docs, runtimes]);

  return (
    <div>
      <div className="mx-auto max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documentation…"
          aria-label="Search documentation"
          className="w-full rounded-full border border-neutral-800 bg-neutral-900/50 px-5 py-3 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {results && (
        <div className="mx-auto mt-6 max-w-xl space-y-2">
          {results.docMatches.length === 0 && results.runtimeMatches.length === 0 && (
            <p className="text-center text-sm text-neutral-500">No results for &ldquo;{query}&rdquo;.</p>
          )}
          {results.runtimeMatches.map((r) => (
            <Link
              key={r.slug}
              href={`/docs/runtimes/${r.slug}`}
              className="block rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900"
            >
              <span className="text-neutral-500">Runtime · </span>
              <span className="font-medium text-neutral-100">{r.name}</span>
            </Link>
          ))}
          {results.docMatches.map((d) => (
            <Link
              key={d.slug}
              href={`/docs/${d.slug}`}
              className="block rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900"
            >
              <span className="text-neutral-500">{d.category} · </span>
              <span className="font-medium text-neutral-100">{d.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
