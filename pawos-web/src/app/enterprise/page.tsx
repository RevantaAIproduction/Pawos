import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = {
  title: "Engineering Teams",
  description: "PawOS organization plans for engineering teams: shared workspaces, task coordination, Git collaboration, approvals and usage controls.",
};

const WORKFLOW = [
  { step: "Connect the work", body: "Bring supported project and service context into the workspace. Each connector's available read and write actions are documented separately." },
  { step: "Coordinate tasks", body: "Use organization task management and assignment to give engineering work a clear owner and visible status." },
  { step: "Execute with controls", body: "PawOS runs supported work in the relevant local or connected environment. Permission gates apply to actions that require approval." },
  { step: "Review the evidence", body: "Inspect recorded changes, command output, verification results and run history. A reported completion is not a substitute for independently verified external writes." },
];

const CAPABILITIES = [
  { title: "Shared workspaces", body: "Team and Enterprise plans include shared organization workspaces and companions." },
  { title: "Task management", body: "Assign work and track task status across the organization." },
  { title: "Git collaboration", body: "Use AI-assisted pull-request review against connected repository history. PR creation and ticket write-back availability depends on connector capabilities." },
  { title: "Remote assistance", body: "Organization features list screen sharing and control. Confirm current availability and setup requirements before rollout." },
  { title: "Credential vault and approvals", body: "Use organization credential management and approval queues for supported actions. Exact coverage depends on configuration." },
  { title: "Audit history", body: "Review supported organization actions in the audit log. This is not a compliance certification or a guarantee that every external event is recorded." },
  { title: "Roles and administration", body: "Team includes Owner, Billing/Workspace Admin and Member roles. Enterprise adds IT Administrator, Security Administrator and Department Manager roles." },
  { title: "Usage and billing", body: "Team uses per-seat usage tiers. Enterprise uses a uniform $20/seat/month base plus separately metered Autonomous Engineering Task usage." },
];

export default function EnterprisePage() {
  return (
    <>
      <Section>
        <div className="text-center">
          <Badge tone="blue">For engineering organizations</Badge>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">Give engineering work a shared operating layer.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-neutral-400">PawOS brings project context, task coordination, supported execution and review into one organization workspace — with roles, approvals and usage controls around the work.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button href="/support/sales">Discuss your team</Button>
            <Button href="/pricing" variant="secondary">Compare plans</Button>
          </div>
        </div>
      </Section>
      <Section eyebrow="A controlled engineering workflow" title="From assigned work to reviewable outcomes" className="border-t border-neutral-900">
        <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2">
          {WORKFLOW.map((item, index) => (
            <li key={item.step} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">Step 0{index + 1}</p>
              <h2 className="mt-3 text-lg font-semibold text-white">{item.step}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section eyebrow="Organization capabilities" title="Shared context, coordination and governance" className="border-t border-neutral-900">
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((item) => (
            <article key={item.title} className="rounded-xl border border-neutral-800 p-5">
              <h3 className="font-semibold text-neutral-100">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{item.body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section eyebrow="Plan structure" title="Choose the organization model" className="border-t border-neutral-900 bg-neutral-900/20">
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-neutral-800 p-7">
            <h2 className="text-xl font-semibold text-white">Team</h2>
            <p className="mt-2 text-sm text-neutral-400">For 2–150 members. Standard seats are $20/member/month with 2,000 PC; Premium seats are $100/member/month with 10,000 PC. Seat tiers can be mixed.</p>
            <Link href="/pricing#individual-plans" className="mt-5 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">View Team pricing →</Link>
          </article>
          <article className="rounded-2xl border border-neutral-800 p-7">
            <h2 className="text-xl font-semibold text-white">Enterprise</h2>
            <p className="mt-2 text-sm text-neutral-400">For 20+ members. $20/member/month base seat fee plus metered Autonomous Engineering Task usage at pass-through provider rates.</p>
            <Link href="/pricing#autonomous-engineering" className="mt-5 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">Understand task billing →</Link>
          </article>
        </div>
      </Section>
      <Section eyebrow="Plan your rollout" title="Confirm fit before deployment" className="border-t border-neutral-900">
        <div className="mx-auto max-w-2xl space-y-3 text-neutral-400">
          <p>Tell us about your team size, repository hosts, ticket trackers, local development environments, identity requirements and expected task volume.</p>
          <p>We will confirm which connectors, governance controls and workflows are currently supported before you commit to a rollout. SSO and provider-specific deployment requirements should be validated during that discussion.</p>
          <div className="flex flex-wrap gap-3 pt-4">
            <Button href="/support/sales">Contact sales</Button>
            <Button href="/docs/enterprise" variant="secondary">Enterprise documentation</Button>
          </div>
        </div>
      </Section>
    </>
  );
}
