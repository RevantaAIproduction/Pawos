import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = { title: "Roadmap", description: "What's next for PawOS, stated honestly." };

const NOW: { title: string; body: string }[] = [
  { title: "Public installer releases", body: "Windows, macOS, and Linux builds, published and versioned." },
  { title: "Deployment provider coverage", body: "20+ real providers are live; more are added as they're requested." },
];

const NEXT: { title: string; body: string }[] = [
  { title: "SSO for Enterprise", body: "Full single sign-on enablement for organization workspaces." },
  { title: "Deeper CI/CD integration", body: "Broader real, read-only build/test status coverage beyond GitHub Actions and GitLab CI." },
  { title: "Mobile companion sync", body: "Extending the existing pairing infrastructure toward a real mobile companion experience." },
];

const LATER: { title: string; body: string }[] = [
  { title: "AI avatar generation", body: "Generating a custom companion appearance from a photo or description, rather than requiring an uploaded model." },
  { title: "Companion marketplace", body: "A way to discover and share companion packages beyond direct file export/import." },
  { title: "Public API", body: "Not currently committed — would only ship with real, documented endpoints, not a speculative interface." },
];

function List({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="mt-6 space-y-4">
      {items.map((i) => (
        <div key={i.title} className="rounded-lg border border-neutral-800 p-4">
          <h3 className="font-medium text-neutral-100">{i.title}</h3>
          <p className="mt-1 text-sm text-neutral-400">{i.body}</p>
        </div>
      ))}
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <Section
      title="Roadmap"
      subtitle="What's shipped, what's actively being built, and what's a real future direction rather than a promise — see the Changelog for what's already done."
    >
      <div className="mx-auto mt-12 max-w-2xl space-y-12">
        <div>
          <Badge tone="green">In progress</Badge>
          <List items={NOW} />
        </div>
        <div>
          <Badge tone="blue">Next</Badge>
          <List items={NEXT} />
        </div>
        <div>
          <Badge tone="neutral">Later / exploratory</Badge>
          <List items={LATER} />
          <p className="mt-4 text-sm text-neutral-500">
            Items in this section are directions we find credible, not commitments with a date — we&apos;d rather
            under-promise here than publish a roadmap that reads like marketing.
          </p>
        </div>
      </div>
    </Section>
  );
}
