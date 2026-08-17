import type { Metadata } from 'next';
import { DocsTopBar } from '../../components/docs/DocsTopBar';
import { DocsSidebar } from '../../components/docs/DocsSidebar';

export const metadata: Metadata = {
  title: { default: 'PawOS Docs', template: '%s — PawOS Docs' },
  description: 'PawOS developer and product documentation.',
};

/**
 * Dedicated documentation shell — deliberately NOT the marketing RootLayout's visual chrome.
 * Nav/Footer/SiteCompanion still mount (they live in the root layout, which every route nests
 * inside), but are made pathname-aware and render nothing under /docs — see Nav.tsx/Footer.tsx/
 * SiteCompanion.tsx. This file owns everything actually visible here: a light top bar, a
 * collapsible sidebar, and a white article surface — never bg-neutral-950.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <DocsTopBar />
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="hidden w-64 shrink-0 border-r border-neutral-200 lg:block">
          <DocsSidebar />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
