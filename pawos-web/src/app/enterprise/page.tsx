import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = {
  title: "Enterprise",
  description: "PawOS plans for engineering teams with shared workspaces, seat options, permissions and governance.",
};

const CAPABILITIES = [
  { title: "Organization workspaces", body: "Team and Enterprise plans support shared organization workspaces. Membership and available workspace features depend on plan and configuration." },
  { title: "Task management", body: "Organization features include task assignment and status tracking. Check with the team about which workflows are enabled for your plan." },
  { title: "Remote assistance", body: "Remote assistance is listed among organization features. Contact the team for current availability and setup requirements." },
  { title: "Credential management", body: "Organization credential features are designed for controlled access to connected infrastructure. See the security documentation for current behavior and limitations." },
  { title: "Approvals", body: "Organization approval controls can add a review step before supported actions. The actions covered depend on configuration." },
  { title: "Audit history", body: "Organization audit records provide a history of supported actions. They are not a compliance certification or a guarantee that every external event is recorded." },
  { title: "Single sign-on", body: "SSO availability is not confirmed as generally available. Ask the team about current status before planning a rollout." },
  { title: "Seat-based plans", body: "Team and Enterprise are organization plans billed by seat. Team is available for 2–150 seats; Enterprise starts at 20. Contact sales for current pricing and usage terms." },
  { title: "Roles and spending controls", body: "Organization plans include role-based access and spending controls. Available roles, limits and shared-pool behavior vary by plan." },
];

const SCALE = [
  { label: "Individual", body: "Use PawOS on your own account and device." },
  { label: "Team", body: "Set up seats and shared organization workspaces for a small engineering group." },
  { label: "Enterprise", body: "Talk with the team about seat count, usage, controls and rollout requirements." },
];

export default function EnterprisePage() {
  return (
    <>
      <Section>
        <div className="text-center">
          <Badge tone="blue">Enterprise</Badge>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            PawOS for engineering teams
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-neutral-400">
            Team and Enterprise plans add organization workspaces, administration and controls to PawOS. Tell us how your team works and we&apos;ll confirm which features and terms fit your rollout.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button href="/support/sales">Contact sales</Button>
            <Button href="/pricing" variant="secondary">See pricing</Button>
          </div>
        </div>
      </Section>

      <Section eyebrow="Capabilities" title="Organization features" className="border-t border-neutral-900">
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="rounded-xl border border-neutral-800 p-6">
              <h3 className="font-semibold text-neutral-100">{c.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Plans" title="Choose a plan for your organization" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {SCALE.map((s) => (
            <div key={s.label} className="text-center">
              <h3 className="text-xl font-semibold text-blue-300">{s.label}</h3>
              <p className="mt-3 text-sm text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Deployment" title="Discuss your environment" className="border-t border-neutral-900">
        <div className="mx-auto mt-6 max-w-2xl space-y-4 text-neutral-400">
          <p>
            Deployment workflows depend on the configured runtime, provider and permissions. The website does not promise support for every cloud or hosting provider. Talk with the team about your environment before planning a rollout.
          </p>
          <p>
            For current technical details and security practices, see our{" "}
            <Link href="/docs/enterprise" className="text-blue-400 hover:underline">
              Enterprise documentation
            </Link>{" "}
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
        <p className="mx-auto mt-3 max-w-md text-neutral-400">Talk with our team about seat options, usage and rollout for your organization.</p>
        <div className="mt-6">
          <Button href="/support/sales">Contact sales</Button>
        </div>
      </Section>
    </>
  );
}
