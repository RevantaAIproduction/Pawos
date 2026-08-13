import type { Metadata } from "next";
import { Section } from "../../../components/ui/Section";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
import { NotifyButton } from "../NotifyButton";
import { getDownloadPlatform } from "../../../lib/config/downloadConfig";

export const metadata: Metadata = {
  title: "Download for Windows",
  description: "Download PawOS for Windows.",
};

export default function WindowsDownloadPage() {
  const platform = getDownloadPlatform("windows");
  return (
    <Section title="Download PawOS for Windows">
      <Breadcrumbs items={[{ label: "Download", href: "/download" }, { label: "Windows" }]} />
      <p className="mt-4 max-w-xl text-neutral-400">Windows 10 (64-bit) or later, 4 GB RAM minimum (8 GB recommended).</p>
      <div className="mx-auto mt-10 max-w-md space-y-4">
        {platform.variants.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
            <div>
              <p className="text-sm font-medium text-neutral-100">{v.label}</p>
              <p className="text-xs text-neutral-500">Coming soon</p>
            </div>
            <NotifyButton platform="windows" className="rounded-full border border-blue-400/40 px-4 py-1.5 text-xs font-semibold text-blue-200 hover:border-blue-300 hover:text-blue-100" />
          </div>
        ))}
      </div>
    </Section>
  );
}
