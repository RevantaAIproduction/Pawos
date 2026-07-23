import type { Metadata } from "next";
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
    </Section>
  );
}
