'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { DocsSearch } from './DocsSearch';
import { DocsSidebar } from './DocsSidebar';
import { buildSearchIndex } from '../../lib/docs/registry';

const searchIndex = buildSearchIndex();

export function DocsTopBar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open documentation navigation"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <Link href="/docs" className="flex shrink-0 items-center gap-2 font-semibold text-neutral-900">
            <Image src="/logo-icon.png" alt="" width={22} height={22} className="rounded-md" />
            <span>
              Paw<span className="text-neutral-500">OS</span> Docs
            </span>
          </Link>

          <div className="ml-2 hidden shrink-0 rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-500 sm:block">
            v0 (pre-release)
          </div>

          <div className="flex-1" />

          <div className="hidden sm:block">
            <DocsSearch index={searchIndex} />
          </div>

          <nav className="hidden items-center gap-4 text-sm text-neutral-500 md:flex">
            <Link href="/" className="transition hover:text-neutral-900">
              Website
            </Link>
            <Link href="/support" className="transition hover:text-neutral-900">
              Support
            </Link>
          </nav>
        </div>
        <div className="border-t border-neutral-100 px-4 py-2 sm:hidden">
          <DocsSearch index={searchIndex} />
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <span className="font-semibold text-neutral-900">Documentation</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <DocsSidebar mobile onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
