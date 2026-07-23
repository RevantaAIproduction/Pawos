import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = {
  title: "Enterprise",
  description: "PawOS for teams and enterprises: shared workspaces, governance, security, and dedicated support.",
};

const CAPABILITIES = [
  { title: "Shared Organization Workspaces", body: "Members, projects, and shared documents scoped to your organization's verified email domain — with real-time presence and live cursors on shared documents." },
  { title: "Task lifecycle & assignment", body: "Assign work, track task status, and grant temporary elevated permissions scoped to a specific task rather than a permanent role change." },
  { title: "Remote assistance", body: "Screen-share-based remote assistance with a shared terminal, so a teammate can help debug a colleague's machine directly." },
  { title: "Credential vault", body: "Organization-shared infrastructure credentials stored encrypted, never in plain text, and accessed only through gated actions." },
  { title: "Approval policies", body: "Require explicit approval before specific action types (like production deploys) run, with a real, queryable approval queue." },
  { title: "Audit log", body: "A durable, exportable audit log of infrastructure-affecting actions for compliance evidence." },
  { title: "SSO (in progress)", body: "Single sign-on enablement for organizations — see our security documentation for current status and honest capability notes." },
  { title: "Seat-based billing", body: "Team ($/seat/mo, 2–150 seats) and Enterprise ($/seat/mo, 20+ seats with custom terms) — billed per member, not per device." },
];

const SCALE = [
  { label: "One Paw", body: "A single companion on one device — the same PawOS every individual uses." },
  { label: "Ten Paws", body: "A small team sharing companions, credits, and CRM context inside one Organization Workspace." },
  { label: "A hundred Paws", body: "A larger organization enforcing approval policies, governance, and audit evidence across every member." },
];

export default function EnterprisePage() {
  return (
    <>
      <Section>
        <div className="text-center">
          <Badge tone="blue">Enterprise</Badge>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            One platform, from a single Paw to a whole organization
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-neutral-400">
            PawOS scales without maintaining a separate product for teams — the same runtimes, the same
            architecture, with governance and collaboration layered on top.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button href="/support/sales">Talk to sales</Button>
            <Button href="/pricing" variant="secondary">See pricing</Button>
          </div>
        </div>
      </Section>

      <Section eyebrow="Capabilities" title="Built for organizations, not just individuals" className="border-t border-neutral-900">
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{c.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Scale" title="One Paw. Ten Paws. A hundred Paws." className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {SCALE.map((s) => (
            <div key={s.label} className="text-center">
              <h3 className="text-xl font-semibold text-blue-300">{s.label}</h3>
              <p className="mt-3 text-sm text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Deployment" title="Self-hosting & infrastructure" className="border-t border-neutral-900">
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-neutral-400">
          <p>
            PawOS deploys through a provider-agnostic Infrastructure Runtime — your organization's own cloud and
            hosting accounts, connected via each provider's official CLI or API. PawOS never holds your production
            credentials on its own servers; every connector runs against your machine's own already-authenticated
            session.
          </p>
          <p>
            For large-scale automation and CI/CD integration, see our{" "}
            <a href="/docs/enterprise" className="text-blue-400 hover:underline">
              Enterprise documentation
            </a>{" "}
            and{" "}
            <a href="/security" className="text-blue-400 hover:underline">
              security overview
            </a>
            .
          </p>
        </div>
      </Section>

      <Section className="text-center border-t border-neutral-900">
        <h2 className="text-2xl font-bold">Ready to bring PawOS to your team?</h2>
        <div className="mt-6">
          <Button href="/support/sales">Contact sales</Button>
        </div>
      </Section>
    </>
  );
}
