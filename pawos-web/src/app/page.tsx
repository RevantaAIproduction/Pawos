import { Container } from "../components/ui/Container";
import { Section } from "../components/ui/Section";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { FeatureCard } from "../components/ui/FeatureCard";
import { FEATURES } from "../lib/featuresContent";

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
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_60%)]"
        />
        <Container className="py-24 text-center sm:py-32">
          <Badge tone="blue">Now with 20+ real deployment providers</Badge>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold tracking-tight text-balance sm:text-6xl">
            Your companion. Your desktop. Your work — actually done.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
            PawOS is an AI companion that lives on your desktop — it plans, executes, and remembers, so you can
            focus on the work that actually matters. Not a chatbot in a browser tab. A real engineering teammate.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button href="/download">Download PawOS</Button>
            <Button href="/docs" variant="secondary">
              Read the docs
            </Button>
          </div>
          <p className="mt-6 text-xs text-neutral-500">Free to start on Paw Go · Windows, macOS, and Linux</p>
        </Container>
      </section>

      {/* Value proposition */}
      <Section
        eyebrow="Why it's different"
        title="Most AI tools talk. Paw acts."
        subtitle="PawOS doesn't wait in a chat window for you to copy-paste its suggestions. It runs on your machine, sees what you're working on, and takes real, confirmed action — files, terminals, browsers, deployments, and more."
      >
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
            <h3 className="text-lg font-semibold text-neutral-300">Without a companion</h3>
            <p className="mt-2 text-sm text-neutral-500">
              You juggle a dozen open windows, re-explain context every time you switch tasks, and copy AI
              suggestions into your own terminal by hand.
            </p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
            <h3 className="text-lg font-semibold text-blue-300">With Paw</h3>
            <p className="mt-2 text-sm text-neutral-300">
              One companion lives on your desktop, remembers your projects, and can plan, execute, and deploy on
              your behalf — with your confirmation at every risky step.
            </p>
          </div>
        </div>
      </Section>

      {/* Interactive feature highlights */}
      <Section
        eyebrow="Capabilities"
        title="Everything a real engineering teammate needs"
        subtitle="A sample of what PawOS can do out of the box — explore the full list on the Features page."
      >
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((f) => (
            <FeatureCard key={f.slug} title={f.title} body={f.tagline} href={`/features/${f.slug}`} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button href="/features" variant="secondary">
            See all features
          </Button>
        </div>
      </Section>

      {/* Runtime overview */}
      <Section
        eyebrow="Architecture"
        title="Six runtimes, one companion"
        subtitle="PawOS is built from focused, independently real runtimes — not one monolithic prompt pretending to do everything."
      >
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {RUNTIMES.map((r) => (
            <div key={r.name} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{r.name}</h3>
              <p className="mt-2 text-sm text-neutral-400">{r.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Autonomous Ticket Resolution */}
      <Section className="border-y border-neutral-900 bg-neutral-900/30">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge tone="green">Flagship capability</Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Autonomous Ticket Resolution</h2>
            <p className="mt-4 text-neutral-400">
              Hand Paw a real ticket from Jira, Linear, GitHub Issues, or Azure Boards. It investigates with real
              evidence, plans a fix, implements and tests it, opens a pull request, and updates the ticket — billed
              only once that full cycle genuinely completes.
            </p>
            <div className="mt-6 flex gap-4">
              <Button href="/docs/autonomous-ticket-resolution" variant="secondary">
                See how it works
              </Button>
              <Button href="/pricing#autonomous-engineering" variant="ghost">
                Pricing →
              </Button>
            </div>
          </div>
          <ol className="space-y-4">
            {["Investigate with real evidence", "Plan the fix", "Implement & test", "Open a PR & update the ticket"].map(
              (step, i) => (
                <li key={step} className="flex items-start gap-4 rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-300">
                    {i + 1}
                  </span>
                  <span className="text-sm text-neutral-300">{step}</span>
                </li>
              )
            )}
          </ol>
        </div>
      </Section>

      {/* How it works */}
      <Section eyebrow="How it works" title="From request to result">
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step}>
              <p className="text-sm font-mono text-blue-400">{s.step}</p>
              <h3 className="mt-2 font-semibold text-neutral-100">{s.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Why PawOS */}
      <Section eyebrow="Why PawOS" title="Built to be trusted with real work">
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            { title: "Honest by design", body: "Paw reports what actually happened — never a fabricated success on a task that failed or is still in progress." },
            { title: "Confirmed, not silent", body: "Destructive or production-impacting actions always pause for your explicit confirmation first." },
            { title: "One platform, every size", body: "The same PawOS scales from a single Paw on your laptop to shared organization workspaces with governance." },
          ].map((v) => (
            <div key={v.title} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{v.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{v.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Enterprise */}
      <Section className="border-y border-neutral-900 bg-neutral-900/30" eyebrow="For teams" title="One platform for individuals, teams, and enterprises">
        <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-400">
          Shared workspaces, real-time presence, task assignment, remote assistance, and org-wide governance —
          without maintaining a separate product for teams.
        </p>
        <div className="mt-10 text-center">
          <Button href="/enterprise" variant="secondary">
            Explore Enterprise
          </Button>
        </div>
      </Section>

      {/* Security */}
      <Section eyebrow="Security" title="Confirmation gates. Audit logs. Encrypted credentials.">
        <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-400">
          Every risky action is gated, every infrastructure change can be logged, and organization secrets are
          stored in an encrypted vault — never in plain text.
        </p>
        <div className="mt-10 text-center">
          <Button href="/security" variant="secondary">
            Read the security overview
          </Button>
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to get real work done?</h2>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          Download PawOS and start free on Paw Go — no credit card required.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button href="/download">Download PawOS</Button>
          <Button href="/pricing" variant="secondary">
            View pricing
          </Button>
        </div>
      </Section>
    </>
  );
}
