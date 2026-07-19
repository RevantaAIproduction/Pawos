import type { Metadata } from "next";

export const metadata: Metadata = { title: "Download — PawOS" };

/**
 * Same honest-placeholder pattern as pricing/page.tsx: PawOS isn't publicly
 * distributed yet (no hosted installer, no release channel), so this page
 * says that plainly instead of linking to a build that doesn't exist. Once a
 * real release exists, the platform cards below get real download hrefs and
 * nothing else on this page needs to change.
 */
const PLATFORMS = ["Windows", "macOS", "Linux"];

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-4xl font-bold">Download PawOS</h1>
      <p className="mx-auto mt-4 max-w-xl text-neutral-400">
        PawOS is still in private development — public installers aren&apos;t available yet. Once
        builds are published, they&apos;ll appear here for each platform below.
      </p>

      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        {PLATFORMS.map((platform) => (
          <div key={platform} className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8">
            <h2 className="text-lg font-semibold">{platform}</h2>
            <p className="mt-3 text-sm text-neutral-400">Coming soon</p>
          </div>
        ))}
      </div>

      <p className="mt-14 text-sm text-neutral-500">
        Once PawOS is installed, Companion Studio — creating, customizing, and managing your
        companion — lives entirely inside the app.
      </p>
    </div>
  );
}
