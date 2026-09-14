import Image from "next/image";
import { HeroAnimation } from "../components/HeroAnimation";
import { Container } from "../components/ui/Container";
import { Section } from "../components/ui/Section";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { FeatureCard } from "../components/ui/FeatureCard";
import { FEATURES } from "../lib/featuresContent";
import { CompanionPreview } from "../components/companion-preview/CompanionPreview";

const HIGHLIGHT_SLUGS = [
  "desktop-ai",
  "autonomous-engineering",
  "deployments",
  "companions",
  "memory",
  "safety",
];

const RUNTIMES = [
  { name: "Universal Execution", body: "Files, apps, processes, and terminals — a single auditable engine for everyday desktop work." },
  { name: "Browser Runtime", body: "A real, controllable browser session for research, forms, and structured data extraction." },
  { name: "Infrastructure Runtime", body: "Deploy, roll back, and provision across 20+ real hosting and cloud providers." },
  { name: "Communication Runtime", body: "Meetings and calls become searchable memory, with consent required before any capture." },
  { name: "Companion Runtime", body: "A real, animated 3D presence with procedural motion and live lip-sync." },
  { name: "Governance Runtime", body: "Approval gates, an audit log, and an encrypted credential vault for organizations." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Ask", body: "Type or speak a request — anything from a quick file operation to a full engineering ticket." },
  { step: "02", title: "Plan", body: "Paw breaks the request into concrete steps and shows you the plan before acting." },
  { step: "03", title: "Execute", body: "Real actions run on your machine — narrated as they happen, gated when they're risky." },
  { step: "04", title: "Report", body: "You get an honest result: what worked, what didn't, and what's genuinely finished." },
];

export default function Home() {
  const highlights = HIGHLIGHT_SLUGS.map((slug) => FEATURES.find((f) => f.slug === slug)!).filter(Boolean);

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden border-b border-neutral-900">
        <HeroAnimation />
        <Container className="relative z-10 flex flex-col items-center py-24 text-center">
          <div className="mb-8 overflow-hidden rounded-2xl bg-black/20 p-2 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
            <Image src="/logo-icon.png" alt="PawOS Mark" width={64} height={64} className="h-16 w-16 object-contain" />
          </div>
          <h1 className="mt-2 text-6xl font-medium tracking-tight text-white sm:text-8xl">
            PawOS
          </h1>
          <p className="mt-6 text-2xl font-light text-white/90 sm:text-3xl">
            Your AI coding companion.
          </p>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Understand your project. Build with you.<br />
            Or let PawOS take the work.
          </p>
          <div className="mt-12 flex justify-center">
            <Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
              Download for Windows &rarr;
            </Button>
          </div>
        </Container>
      </section>

      {/* Product / Value Introduction */}
      <Section className="bg-black py-32 text-center border-b border-neutral-900">
        <h2 className="mx-auto max-w-4xl text-4xl font-medium tracking-tight text-white sm:text-5xl">
          Most AI tools talk. Paw acts.
        </h2>
        <p className="mx-auto mt-6 max-w-3xl text-xl text-neutral-400">
          PawOS doesn't wait in a chat window for you to copy-paste its suggestions. It runs natively on your machine, sees what you're working on, and takes real, confirmed action—files, terminals, browsers, deployments, and more.
        </p>
      </Section>

      {/* 1. Understanding a project */}
      <Section className="bg-black py-32 border-b border-neutral-900">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-medium text-white sm:text-5xl tracking-tight">Understanding your project</h2>
          <p className="mt-6 text-xl text-neutral-400 max-w-2xl mx-auto">
            PawOS builds deep semantic memory across your entire workspace, so you never have to re-explain context when switching tasks.
          </p>
        </div>
        
        {/* Placeholder for actual PawOS UI Screenshot */}
        <div className="mx-auto max-w-6xl aspect-[16/9] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl relative overflow-hidden flex items-center justify-center group">
           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.05),_transparent_70%)]" />
           <p className="text-neutral-600 font-mono text-sm relative z-10 transition group-hover:opacity-0">[ REAL PAWOS SCREENSHOT: Understanding/Memory UI ]</p>
        </div>
      </Section>

      {/* 2. Building alongside the user */}
      <Section className="bg-black py-32 border-b border-neutral-900">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-medium text-white sm:text-5xl tracking-tight">Building alongside you</h2>
          <p className="mt-6 text-xl text-neutral-400 max-w-2xl mx-auto">
            From quick file edits to executing terminal commands, PawOS turns your intent into action directly on your machine.
          </p>
        </div>
        
        {/* Placeholder for actual PawOS UI Screenshot */}
        <div className="mx-auto max-w-6xl aspect-[16/9] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl relative overflow-hidden flex items-center justify-center group">
           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.05),_transparent_70%)]" />
           <p className="text-neutral-600 font-mono text-sm relative z-10 transition group-hover:opacity-0">[ REAL PAWOS SCREENSHOT: Building/Executing UI ]</p>
        </div>
      </Section>

      {/* 3. Autonomous Ticket Resolution */}
      <Section className="bg-black py-32 border-b border-neutral-900">
        <div className="text-center mb-16">
          <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6">
            Flagship capability
          </div>
          <h2 className="text-3xl font-medium text-white sm:text-5xl tracking-tight">Autonomous Ticket Resolution</h2>
          <p className="mt-6 text-xl text-neutral-400 max-w-3xl mx-auto">
            Hand Paw a real ticket from Jira, Linear, or GitHub. It investigates with real evidence, plans a fix, implements it, tests it, opens a PR, and updates the ticket.
          </p>
        </div>
        
        {/* Placeholder for actual PawOS UI Screenshot */}
        <div className="mx-auto max-w-6xl aspect-[16/9] rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl relative overflow-hidden flex items-center justify-center group">
           <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.05),_transparent_70%)]" />
           <p className="text-neutral-600 font-mono text-sm relative z-10 transition group-hover:opacity-0">[ REAL PAWOS SCREENSHOT: Autonomous Work UI ]</p>
        </div>
      </Section>

      {/* Additional PawOS Information */}
      <Section className="bg-black py-32 border-b border-neutral-900">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-indigo-400">Architecture</h2>
            <p className="mt-2 text-3xl font-medium tracking-tight text-white sm:text-4xl">
              Six runtimes, one companion.
            </p>
            <p className="mt-6 text-lg leading-8 text-neutral-400">
              PawOS is built from focused, independently real runtimes—not one monolithic prompt pretending to do everything.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {[
                { title: "Honest by design", body: "Paw reports what actually happened—never a fabricated success on a task that failed or is still in progress." },
                { title: "Confirmed, not silent", body: "Destructive or production-impacting actions always pause for your explicit confirmation first." },
                { title: "One platform, every size", body: "The same PawOS scales from a single Paw on your laptop to shared organization workspaces with governance." },
              ].map((feature) => (
                <div key={feature.title} className="flex flex-col">
                  <dt className="text-lg font-semibold leading-7 text-white">
                    {feature.title}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-neutral-400">
                    <p className="flex-auto">{feature.body}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="relative overflow-hidden bg-black py-32 text-center">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom,_rgba(99,102,241,0.15),_transparent_60%)]" />
        <h2 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
          Ready to build with PawOS?
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-xl text-neutral-400">
          Your AI coding companion for understanding, building, and getting real work done.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
            Download for Windows &rarr;
          </Button>
        </div>
      </Section>
    </>
  );
}
