import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { OsDownloadPicker } from "./OsDownloadPicker";

export const metadata: Metadata = {
  title: "Download",
  description: "Download PawOS for Windows, macOS, and Linux.",
};

const REQUIREMENTS = [
  { platform: "Windows", spec: "Windows 10 (64-bit) or later, 4 GB RAM minimum (8 GB recommended)", href: "/download/windows" },
  { platform: "macOS", spec: "macOS 12 Monterey or later, Apple Silicon or Intel", href: "/download/macos" },
  { platform: "Linux", spec: "A modern glibc-based distribution (Ubuntu 22.04+ or equivalent), 4 GB RAM minimum", href: "/download/linux" },
];

export default function DownloadPage() {
  return (
    <>
      <Section title="Download PawOS" subtitle="PawOS is in active development. Pick your platform below to check current availability per build.">
        <div className="mt-12">
          <OsDownloadPicker />
        </div>
      </Section>

      <Section eyebrow="System requirements" title="What you'll need" className="border-t border-neutral-900">
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {REQUIREMENTS.map((r) => (
            <Link key={r.platform} href={r.href} className="rounded-xl border border-neutral-800 p-6 transition hover:border-neutral-700 hover:bg-neutral-900/40">
              <h3 className="font-semibold text-neutral-100">{r.platform}</h3>
              <p className="mt-2 text-sm text-neutral-400">{r.spec}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Release information" title="Version, checksums & changelog" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-6 max-w-2xl space-y-3 text-neutral-400">
          <p>
            Once the first public build is published, its version number, SHA-256 checksums, and full release
            notes will appear here. See the <Link href="/changelog" className="text-blue-400 hover:underline">Changelog</Link> for
            what's shipped so far in development.
          </p>
        </div>
      </Section>

      <Section className="border-t border-neutral-900 text-center">
        <p className="text-sm text-neutral-500">
          Once PawOS is installed, Companion Studio — creating, customizing, and managing your companion — lives
          entirely inside the app.
        </p>
      </Section>
    </>
  );
}
