import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
import { getDownloadPlatform } from "../../../lib/config/downloadConfig";

export const metadata: Metadata = {
  title: "Download for macOS",
  description: "Download PawOS for macOS.",
};

export default function MacDownloadPage() {
  const platform = getDownloadPlatform("macos");
  return (
    <Section title="Download PawOS for macOS">
      <Breadcrumbs items={[{ label: "Download", href: "/download" }, { label: "macOS" }]} />
      <p className="mt-4 max-w-xl text-neutral-400">macOS 12 Monterey or later, Apple Silicon or Intel.</p>
      <div className="mx-auto mt-10 max-w-md space-y-4">
        {platform.variants.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
            <div>
              <p className="text-sm font-medium text-neutral-100">{v.label}</p>
              <p className="text-xs text-neutral-500">{v.status === "available" ? "Ready to download" : "Coming soon"}</p>
            </div>
            {v.status === "available" ? (
              <a href={v.url!} className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90">
                Download
              </a>
            ) : (
              <span className="rounded-full border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-neutral-500">Coming soon</span>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
