import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "../../../../components/ui/Section";
import { RUNTIMES, getRuntimeBySlug } from "../../../../lib/runtimesContent";

export function generateStaticParams() {
  return RUNTIMES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const runtime = getRuntimeBySlug(slug);
  if (!runtime) return {};
  return { title: runtime.name, description: runtime.purpose };
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default async function RuntimeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const runtime = getRuntimeBySlug(slug);
  if (!runtime) notFound();

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Runtime documentation</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{runtime.name}</h1>
        <p className="mt-4 text-neutral-400">{runtime.purpose}</p>

        <Block title="Capabilities">
          <ul className="space-y-2 text-neutral-400">
            {runtime.capabilities.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </Block>

        <Block title="Supported providers">
          <ul className="space-y-2 text-neutral-400">
            {runtime.providers.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </Block>

        <Block title="Architecture">
          <p className="text-neutral-400">{runtime.architecture}</p>
        </Block>

        <Block title="Execution flow">
          <ol className="space-y-3">
            {runtime.executionFlow.map((f, i) => (
              <li key={f.step} className="flex gap-4 rounded-lg border border-neutral-800 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-300">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-neutral-100">{f.step}</p>
                  <p className="mt-1 text-sm text-neutral-400">{f.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Block>

        <Block title="Examples">
          <ul className="space-y-2 text-neutral-400">
            {runtime.examples.map((e) => (
              <li key={e} className="font-mono text-sm">{e}</li>
            ))}
          </ul>
        </Block>

        <Block title="Use cases">
          <ul className="space-y-2 text-neutral-400">
            {runtime.useCases.map((u) => (
              <li key={u}>• {u}</li>
            ))}
          </ul>
        </Block>

        <Block title="Limitations">
          <ul className="space-y-2 text-neutral-500">
            {runtime.limitations.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
        </Block>

        <Block title="Best practices">
          <ul className="space-y-2 text-neutral-400">
            {runtime.bestPractices.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        </Block>

        <Block title="Future improvements">
          <ul className="space-y-2 text-neutral-500">
            {runtime.futureImprovements.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </Block>

        <Link href="/docs" className="mt-12 inline-block text-sm text-neutral-500 hover:text-neutral-300">
          ← All documentation
        </Link>
      </div>
    </Section>
  );
}
