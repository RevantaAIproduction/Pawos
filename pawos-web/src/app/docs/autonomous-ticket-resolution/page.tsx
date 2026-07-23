import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../../components/ui/Section";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";

export const metadata: Metadata = {
  title: "Autonomous Ticket Resolution",
  description: "How PawOS investigates, plans, implements, tests, and delivers real engineering tickets end to end.",
};

const LIFECYCLE = [
  { title: "Investigate", body: "Paw gathers real evidence about the reported issue — browser console output, network requests, repository history, and prior engineering memory — before proposing anything. No investigation is skipped or fabricated." },
  { title: "Plan", body: "A concrete implementation plan is drafted and tracked as a live TODO list, visible in the Coding Canvas as it progresses." },
  { title: "Implement", body: "Paw writes the fix against the plan, using the same Universal Execution and Git runtimes available in any coding session." },
  { title: "Test", body: "Real tests run against the change. A task is never marked further along than its actual test results support." },
  { title: "Deploy", body: "Where applicable, a deploy runs through the Infrastructure Runtime, with automatic health-check-and-rollback if something regresses." },
  { title: "Report", body: "A structured engineering report captures what was found, what was changed, and why — persisted as real engineering memory for future reference." },
];

const SAFETY = [
  "Production-impacting steps (like a deploy) go through the same approval gate as any manual request.",
  "A task that fails, is cancelled, hits its retry limit, or is denied approval never bills — see the billing model below.",
  "Every infrastructure-affecting action can be recorded in the audit log for organizations that require it.",
];

const FAQ = [
  { q: "What ticket trackers are supported?", a: "PawOS is tracker-agnostic — Jira, Linear, GitHub Issues, Azure Boards, and others connected through the Infrastructure Runtime's project management connectors." },
  { q: "Does it require a connected repository?", a: "Yes — Autonomous Ticket Resolution needs a connected source-control repository to open a real pull request as its deliverable." },
  { q: "What happens if Paw can't resolve the ticket?", a: "It reports honestly what it found and what's blocking it, rather than fabricating a fix. That run is not billed." },
  { q: "Is deploy required for a task to count as complete?", a: "No — completion is tied to a real pull request and an updated ticket, not to a deploy, so teams that gate deploys separately aren't penalized." },
];

export default function AutonomousTicketResolutionPage() {
  return (
    <>
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="green">Flagship capability</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Autonomous Ticket Resolution</h1>
          <p className="mt-4 text-neutral-400">
            Hand Paw a real ticket. It investigates with real evidence, plans a fix, implements and tests it, opens a
            pull request, and updates the ticket — billed only once that full cycle genuinely completes.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button href="/pricing#autonomous-engineering" variant="secondary">See pricing</Button>
            <Button href="/download">Try it</Button>
          </div>
        </div>
      </Section>

      <Section eyebrow="What it is" title="A real engineering cycle, not a suggestion engine" className="border-t border-neutral-900">
        <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-400">
          Most AI coding tools stop at a suggestion you have to copy, review, and apply yourself. Autonomous Ticket
          Resolution runs the full cycle — investigation through delivery — and only counts as done when a real
          pull request exists and the ticket reflects it.
        </p>
      </Section>

      <Section eyebrow="Execution lifecycle" title="Six stages, every time" className="border-t border-neutral-900 bg-neutral-900/30">
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-neutral-800 p-6">
              <span className="text-sm font-mono text-blue-400">0{i + 1}</span>
              <h3 className="mt-2 font-semibold text-neutral-100">{s.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Safety" title="Confirmed, not silent" className="border-t border-neutral-900">
        <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-neutral-400">
          {SAFETY.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Billing" title="Success-gated, by design" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-neutral-400">
          <p>
            An Autonomous Engineering Task is billed once — when it genuinely completes. Every plan includes a real
            monthly allowance before metered billing starts; Enterprise plans can negotiate custom per-task rates at
            volume. Full detail lives on the <Link href="/pricing#autonomous-engineering" className="text-blue-400 hover:underline">Pricing page</Link>.
          </p>
        </div>
      </Section>

      <Section eyebrow="Enterprise usage" title="Built for real ticket volume" className="border-t border-neutral-900">
        <p className="mx-auto mt-4 max-w-2xl text-center text-neutral-400">
          Organizations use Autonomous Ticket Resolution to work through a backlog of well-scoped tickets
          consistently, with every run producing a structured engineering report and, where required, an audit
          trail. See the <Link href="/enterprise" className="text-blue-400 hover:underline">Enterprise page</Link> for governance and approval-policy detail.
        </p>
      </Section>

      <Section eyebrow="FAQ" title="Common questions" className="border-t border-neutral-900">
        <div className="mx-auto mt-8 max-w-2xl divide-y divide-neutral-900">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-left font-medium text-neutral-100">
                {item.q}
                <span className="ml-4 text-neutral-500 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-400">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
