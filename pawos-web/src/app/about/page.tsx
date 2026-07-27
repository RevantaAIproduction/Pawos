import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { mailto } from "../../lib/config/contactConfig";

export const metadata: Metadata = {
  title: "About",
  description: "About PawOS and Revanta AI, the company behind it.",
};

export default function AboutPage() {
  return (
    <>
      <Section eyebrow="About" title="PawOS is built by Revanta AI">
        <div className="mx-auto max-w-2xl space-y-6 text-neutral-400">
          <p>
            PawOS is a desktop AI companion and execution runtime: it pairs a real, animated 3D presence with a set
            of gated runtimes for actually getting work done — files and processes, browser automation, coding
            tasks, infrastructure, communication, and organization collaboration. Every action is narrated as it
            happens, and anything destructive or production-impacting requires your confirmation first.
          </p>
          <p>
            Revanta AI is the company behind PawOS. We build it as a product we&apos;d want to use ourselves: honest
            about what&apos;s shipped versus what&apos;s still a placeholder, and designed so an AI companion can be
            trusted with real work instead of just demoing well.
          </p>
        </div>
      </Section>

      <Section title="Where to go next">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          <Link href="/features" className="rounded-xl border border-neutral-800 p-6 transition hover:border-neutral-700 hover:bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-100">Features</h3>
            <p className="mt-2 text-sm text-neutral-400">What PawOS can actually do today, runtime by runtime.</p>
          </Link>
          <Link href="/trust" className="rounded-xl border border-neutral-800 p-6 transition hover:border-neutral-700 hover:bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-100">Trust &amp; Transparency</h3>
            <p className="mt-2 text-sm text-neutral-400">Our mission, values, and how we handle honesty about the product.</p>
          </Link>
          <Link href="/docs" className="rounded-xl border border-neutral-800 p-6 transition hover:border-neutral-700 hover:bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-100">Documentation</h3>
            <p className="mt-2 text-sm text-neutral-400">Guides for every runtime, from getting started to enterprise deployment.</p>
          </Link>
          <Link href="/legal" className="rounded-xl border border-neutral-800 p-6 transition hover:border-neutral-700 hover:bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-100">Legal</h3>
            <p className="mt-2 text-sm text-neutral-400">Terms of Service, Privacy Policy, and every other PawOS legal document.</p>
          </Link>
        </div>
      </Section>

      <Section title="Get in touch">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <p className="text-neutral-400">Questions about PawOS or Revanta AI — reach the team directly.</p>
          <Button href={mailto("hello")} external variant="secondary">
            Email us
          </Button>
        </div>
      </Section>
    </>
  );
}
