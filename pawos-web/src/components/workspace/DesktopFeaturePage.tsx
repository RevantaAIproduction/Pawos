import Link from "next/link";

const STORE_URL = "https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN";

/**
 * A workspace page for something PawOS does only in the desktop app. It says so plainly and points
 * to the app and the docs — it does not imitate the feature in the browser.
 */
export function DesktopFeaturePage({ title, summary, points, docsHref }: { title: string; summary: string; points: string[]; docsHref: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 md:py-12">
      <h1 className="text-2xl font-medium tracking-tight text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-neutral-400">{summary}</p>

      <div className="mt-8 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-6 sm:p-8">
        <p className="text-base font-medium text-white">Available in the PawOS desktop app</p>
        <ul className="mt-4 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm text-neutral-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-black hover:bg-white">
            Get PawOS for Windows
          </a>
          <Link href={docsHref} className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800">
            Read the docs
          </Link>
        </div>
      </div>
    </div>
  );
}
