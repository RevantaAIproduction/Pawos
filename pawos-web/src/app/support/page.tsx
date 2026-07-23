import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { mailto } from "../../lib/config/contactConfig";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with PawOS: bug reports, feature requests, and support.",
};

const CHANNELS = [
  {
    title: "Bug reports",
    body: "Found something broken? Email us with steps to reproduce.",
    href: mailto("support", "PawOS bug report"),
    cta: "Report a bug",
    external: true,
  },
  {
    title: "Feature requests",
    body: "Have an idea? Send it to us and we'll take a look.",
    href: mailto("support", "PawOS feature request"),
    cta: "Request a feature",
    external: true,
  },
  {
    title: "General questions",
    body: "Anything else about PawOS — reach the team directly.",
    href: mailto("hello"),
    cta: "Email us",
    external: true,
  },
];

export default function SupportPage() {
  return (
    <>
      <Section title="Support" subtitle="Reach the PawOS team directly by email.">
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
