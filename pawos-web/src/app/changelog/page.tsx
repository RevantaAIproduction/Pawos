import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = {
  title: "Changelog",
  description: "PawOS release notes and verified product changes.",
};

export default function ChangelogPage() {
  return (
    <Section title="Changelog" subtitle="Release notes are published here when a change is confirmed in a public release.">
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900/30 p-7">
        <h2 className="text-lg font-semibold text-white">No public release notes published yet</h2>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          This page is limited to changes that can be tied to a verified public release. Internal development milestones and unverified capability claims are not presented as shipped releases.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/docs" className="font-medium text-blue-300 hover:text-blue-200">Read the documentation</Link>
          <Link href="/features" className="font-medium text-blue-300 hover:text-blue-200">Explore product capabilities</Link>
          <Link href="/support/contact" className="font-medium text-blue-300 hover:text-blue-200">Ask about availability</Link>
        </div>
      </div>
    </Section>
  );
}
