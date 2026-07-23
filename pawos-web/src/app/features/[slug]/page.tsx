import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../components/ui/Section";
import { Container } from "../../../components/ui/Container";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Breadcrumbs } from "../../../components/ui/Breadcrumbs";
import { FEATURES, getFeatureBySlug } from "../../../lib/featuresContent";

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return {};
  return {
    title: feature.title,
    description: feature.summary,
  };
}

export default async function FeatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) notFound();

  return (
    <>
      <Section>
        <Container>
          <Breadcrumbs items={[{ label: "Features", href: "/features" }, { label: feature.title }]} />
        </Container>
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="blue">{feature.category}</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{feature.title}</h1>
          <p className="mt-4 text-lg text-neutral-400">{feature.tagline}</p>
        </div>
      </Section>

      <Section className="border-t border-neutral-900">
        <Container className="grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold">Overview</h2>
            <p className="mt-4 text-neutral-400">{feature.summary}</p>

            <div
              aria-hidden
              className="mt-8 flex h-64 items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 text-sm text-neutral-600"
            >
              Screenshot placeholder — {feature.title} in the PawOS desktop app
            </div>

            <h2 className="mt-12 text-xl font-semibold">How it works</h2>
            <ol className="mt-6 space-y-4">
              {feature.workflow.map((w, i) => (
                <li key={w.step} className="flex gap-4 rounded-lg border border-neutral-800 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-300">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-neutral-100">{w.step}</p>
                    <p className="mt-1 text-sm text-neutral-400">{w.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h2 className="mt-12 text-xl font-semibold">Use cases</h2>
            <ul className="mt-4 space-y-2 text-neutral-400">
              {feature.useCases.map((u) => (
                <li key={u}>• {u}</li>
              ))}
            </ul>

            <h2 className="mt-12 text-xl font-semibold">Limitations</h2>
            <ul className="mt-4 space-y-2 text-neutral-500">
              {feature.limitations.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-neutral-800 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Capabilities</h3>
              <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                {feature.capabilities.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-blue-400">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-neutral-800 p-6">
              <Button href="/download" className="w-full">
                Try it in PawOS
              </Button>
              <Link href="/features" className="mt-4 block text-center text-sm text-neutral-500 hover:text-neutral-300">
                ← All features
              </Link>
            </div>
          </aside>
        </Container>
      </Section>
    </>
  );
}
