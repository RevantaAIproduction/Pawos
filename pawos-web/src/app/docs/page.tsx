import type { Metadata } from 'next';
import Link from 'next/link';
import { DOC_NAV } from '../../lib/docs/navigation';

export const metadata: Metadata = {
  title: 'PawOS Docs',
  description: 'PawOS documentation: getting started, core concepts, coding, autonomous work, connectors, billing, security, and reference material.',
};

export default function DocsIndexPage() {
  return (
    <div className="px-6 py-10 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900">PawOS Documentation</h1>
        <p className="mt-3 max-w-2xl text-lg text-neutral-500">
          Everything you need to install, configure, and get real work done with PawOS — the desktop app, Coding Runtime, Autonomous Work, connectors, and billing.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DOC_NAV.map((section) => (
            <div key={section.id} className="rounded-xl border border-neutral-200 p-5">
              <h2 className="font-semibold text-neutral-900">{section.title}</h2>
              <ul className="mt-3 space-y-1.5">
                {section.items.slice(0, 5).map((item) => (
                  <li key={item.slug}>
                    <Link href={`/docs/${section.id}/${item.slug}`} className="text-sm text-neutral-600 hover:text-neutral-950 hover:underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {section.items.length > 5 && (
                <Link
                  href={`/docs/${section.id}/${section.items[0]!.slug}`}
                  className="mt-3 inline-block text-xs font-medium text-neutral-500 hover:text-neutral-900"
                >
                  See all {section.items.length} pages →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
          <h2 className="font-semibold text-neutral-900">New here?</h2>
          <p className="mt-1.5 text-sm text-neutral-600">Start with the Getting Started section, or jump straight to a real coding task.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/docs/getting-started/introduction" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
              Introduction
            </Link>
            <Link href="/docs/getting-started/quickstart" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-white">
              Quickstart
            </Link>
            <Link href="/docs/coding/software-installation" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-white">
              Software Installation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
