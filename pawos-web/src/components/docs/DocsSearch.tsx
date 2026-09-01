'use client';

import Fuse from 'fuse.js';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SearchableEntry } from '../../lib/docs/registry';

/**
 * Global docs search — Cmd/Ctrl+K opens it from anywhere inside the docs shell, not just the
 * index page. Indexes title/description/keywords AND full block body text (headings, paragraphs,
 * lists, steps, tables, code, FAQ) via registry.buildSearchIndex(), closing the prior
 * title+summary-only limitation.
 */
export function DocsSearch({ index }: { index: SearchableEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: [
          { name: 'title', weight: 3 },
          { name: 'description', weight: 2 },
          { name: 'sectionTitle', weight: 1 },
          { name: 'body', weight: 1 },
        ],
        includeScore: false,
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [index]
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return fuse
      .search(q, { limit: 12 })
      .map((r) => r.item);
  }, [query, fuse]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      setQuery('');
      inputRef.current?.focus();
    }
  }, [open]);

  function excerpt(entry: SearchableEntry, q: string): string {
    const idx = entry.body.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return entry.description;
    const start = Math.max(0, idx - 40);
    const snippet = entry.body.slice(start, idx + 80).replace(/\s+/g, ' ').trim();
    return `${start > 0 ? '…' : ''}${snippet}…`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-xs items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 transition hover:border-neutral-300 hover:bg-white"
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          Search docs
        </span>
        <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-24" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documentation…"
                aria-label="Search documentation"
                className="w-full text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none"
              />
              <kbd className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-400">Esc</kbd>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {query.trim() === '' && (
                <p className="px-2 py-6 text-center text-sm text-neutral-400">Start typing to search every documentation page.</p>
              )}
              {query.trim() !== '' && results.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-neutral-400">No results for &ldquo;{query}&rdquo;.</p>
              )}
              {results.map((entry) => (
                <Link
                  key={entry.path}
                  href={`/docs/${entry.path}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 transition hover:bg-neutral-50"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{entry.sectionTitle}</p>
                  <p className="text-sm font-medium text-neutral-900">{entry.title}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{excerpt(entry, query)}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
