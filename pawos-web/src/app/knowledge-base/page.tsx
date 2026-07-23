import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { DOCS } from "../../lib/docsContent";
import { RUNTIMES } from "../../lib/runtimesContent";

export const metadata: Metadata = {
  title: "Knowledge Base",
  description: "Searchable PawOS knowledge base: tutorials, how-to guides, troubleshooting, and runtime guides.",
};

const CATEGORIES: { title: string; description: string; slugs: string[]; runtimeSlugs?: string[] }[] = [
  { title: "Tutorials", description: "Step-by-step walkthroughs for getting started.", slugs: ["getting-started", "installation", "quick-start"] },
  { title: "How-to Guides", description: "Task-focused instructions for specific goals.", slugs: ["companions", "voice", "projects", "tasks", "settings"] },
  { title: "Best Practices", description: "Recommendations for getting the most out of PawOS.", slugs: ["runtime-configuration", "security-architecture", "privacy-and-data"] },
  { title: "Troubleshooting", description: "Fixing common problems.", slugs: ["troubleshooting", "faq"] },
  { title: "Examples & Recipes", description: "Concrete, real request patterns.", slugs: ["quick-start"], runtimeSlugs: ["universal-execution", "browser-runtime"] },
  { title: "Enterprise Guides", description: "Running PawOS across an organization.", slugs: ["enterprise-deployment", "billing-and-usage"], runtimeSlugs: ["governance-runtime"] },
  { title: "Automation Guides", description: "Deployment, CI/CD, and autonomous engineering.", slugs: ["ci-cd", "deployments"], runtimeSlugs: ["infrastructure-runtime"] },
  { title: "Runtime Guides", description: "Deep technical documentation for every runtime.", slugs: [], runtimeSlugs: RUNTIMES.map((r) => r.slug) },
];

export default function KnowledgeBasePage() {
  return (
    <Section title="Knowledge Base" subtitle="Organized by what you're trying to do, not just by feature.">
      <div className="mt-12 space-y-14">
        {CATEGORIES.map((cat) => {
          const docs = cat.slugs.map((s) => DOCS.find((d) => d.slug === s)).filter(Boolean);
          const runtimes = (cat.runtimeSlugs ?? []).map((s) => RUNTIMES.find((r) => r.slug === s)).filter(Boolean);
          return (
            <div key={cat.title}>
              <h2 className="text-lg font-semibold text-neutral-100">{cat.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{cat.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {runtimes.map((r) => (
                  <Link key={r!.slug} href={`/docs/runtimes/${r!.slug}`} className="rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900/50">
                    <p className="font-medium text-neutral-100">{r!.name}</p>
                    <p className="mt-1 text-neutral-500">{r!.purpose}</p>
                  </Link>
                ))}
                {docs.map((d) => (
                  <Link key={d!.slug} href={`/docs/${d!.slug}`} className="rounded-lg border border-neutral-800 p-4 text-sm hover:border-neutral-700 hover:bg-neutral-900/50">
                    <p className="font-medium text-neutral-100">{d!.title}</p>
                    <p className="mt-1 text-neutral-500">{d!.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
