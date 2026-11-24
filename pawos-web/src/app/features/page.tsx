import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { FeatureCard } from "../../components/ui/FeatureCard";
import { FEATURES } from "../../lib/featuresContent";

export const metadata: Metadata = {
  title: "Engineering capabilities",
  description: "Explore PawOS engineering workflows, product capabilities and the boundaries of Web, CLI and Desktop.",
};

const CATEGORIES = ["Core", "Engineering", "Collaboration", "Platform"] as const;

export default function FeaturesIndexPage() {
  return (
    <main className="bg-[#080a0d] text-white">
      <Section
        eyebrow="Product capabilities"
        title="Tools for the work around a software change."
        subtitle="Explore the workflows PawOS supports. Capabilities vary by product experience, account plan, connected service and local setup. Each feature page explains its scope and limitations."
      >
        <div className="mt-12 space-y-16">
          {CATEGORIES.map((category) => {
            const items = FEATURES.filter((feature) => feature.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category} aria-labelledby={`category-${category.toLowerCase()}`}>
                <div className="flex items-end justify-between gap-4 border-b border-neutral-800 pb-4">
                  <h2 id={`category-${category.toLowerCase()}`} className="text-lg font-semibold tracking-tight text-white">{category}</h2>
                  <span className="text-xs text-neutral-500">{items.length} capabilities</span>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((feature) => (
                    <FeatureCard key={feature.slug} title={feature.title} body={feature.tagline} href={`/features/${feature.slug}`} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <section className="mt-20 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Choose an experience</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Where should the work run?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">Web works in a browser with connected repositories. CLI works in the local folder where it is started. Desktop is the Windows local development companion. They do not share identical permissions or capabilities.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/docs/getting-started/four-ways-to-work" className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800">Compare Web, CLI and Desktop</Link>
            <Link href="/pricing" className="rounded-lg border border-neutral-700 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800">Compare plans</Link>
            <Link href="/signup" className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-200">Create an account</Link>
          </div>
        </section>
      </Section>
    </main>
  );
}
