'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DOC_NAV } from '../../lib/docs/navigation';

export function DocsSidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeSection = DOC_NAV.find((s) => pathname?.startsWith(`/docs/${s.id}`))?.id;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <nav aria-label="Documentation" className={mobile ? 'px-4 py-4' : 'sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-4 py-6'}>
      <ul className="space-y-1">
        {DOC_NAV.map((section) => {
          const isOpen = section.id === activeSection || !collapsed[section.id];
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
              >
                {section.title}
                <span className={`text-neutral-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                  ›
                </span>
              </button>
              {isOpen && (
                <ul className="mt-0.5 space-y-0.5 border-l border-neutral-200 pl-3">
                  {section.items.map((item) => {
                    const href = `/docs/${section.id}/${item.slug}`;
                    const active = pathname === href;
                    return (
                      <li key={item.slug}>
                        <Link
                          href={href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={`block rounded-md px-2 py-1.5 text-sm leading-snug transition ${
                            active
                              ? 'bg-neutral-900 font-medium text-white'
                              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                          }`}
                        >
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
