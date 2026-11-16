import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { FeatureCard } from "../../components/ui/FeatureCard";
import { FEATURES } from "../../lib/featuresContent";

export const metadata: Metadata = {
  title: "Features",
  description: "Every PawOS capability, from desktop automation and browser control to autonomous engineering and enterprise governance.",
};

const CATEGORIES = ["Core", "Engineering", "Collaboration", "Platform"] as const;

export default function FeaturesIndexPage() {
  return (
    <Section title="Every capability, in one companion" subtitle="PawOS is built from real, working runtimes — explore what each one actually does.">
      <div className="mt-12 space-y-16">
        {CATEGORIES.map((category) => {
          const items = FEATURES.filter((f) => f.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{category}</h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((f) => (
                  <FeatureCard key={f.slug} title={f.title} body={f.tagline} href={`/features/${f.slug}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-20 border-t border-neutral-900 pt-12 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Find the right PawOS experience</h2>
        <p className="mx-auto mt-3 max-w-2xl text-neutral-400">Compare where Desktop, CLI and Web run, then choose the workflow that fits your task.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/docs/getting-started/web-cli-desktop" className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-900">Compare Desktop, CLI and Web</Link>
          <Link href="/pricing" className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-900">View Pricing</Link>
          <Link href="/signup" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200">Get Started</Link>
        </div>
      </div>
    </Section>
  );
}
