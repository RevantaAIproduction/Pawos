import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with PawOS: bug reports, feature requests, and community support.",
};

const CHANNELS = [
  {
    title: "Bug reports",
    body: "Found something broken? File it on GitHub Issues with steps to reproduce.",
    href: "https://github.com/RevantaAIproduction/Pawos/issues/new",
    cta: "Report a bug",
    external: true,
  },
  {
    title: "Feature requests",
    body: "Have an idea? Open a GitHub Issue tagged as a feature request.",
    href: "https://github.com/RevantaAIproduction/Pawos/issues/new",
    cta: "Request a feature",
    external: true,
  },
  {
    title: "Community",
    body: "Browse existing issues and discussions on the PawOS repository.",
    href: "https://github.com/RevantaAIproduction/Pawos",
    cta: "View on GitHub",
    external: true,
  },
];

export default function SupportPage() {
  return (
    <>
      <Section title="Support" subtitle="PawOS support currently runs through GitHub — dedicated email support channels are being set up.">
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <div key={c.title} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{c.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{c.body}</p>
              <Button href={c.href} external={c.external} variant="secondary" className="mt-4 w-full">
                {c.cta}
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section className="border-t border-neutral-900 text-center">
        <p className="text-sm text-neutral-500">
          Looking for answers first? Check the <Link href="/faq" className="text-blue-400 hover:underline">FAQ</Link>,{" "}
          <Link href="/docs" className="text-blue-400 hover:underline">documentation</Link>, or the{" "}
          <Link href="/knowledge-base" className="text-blue-400 hover:underline">knowledge base</Link>.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href="/support/sales" className="text-sm font-medium text-blue-400 hover:underline">
            Enterprise sales →
          </Link>
        </div>
      </Section>
    </>
  );
}
