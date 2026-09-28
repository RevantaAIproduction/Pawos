import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = { title: "Status", description: "PawOS system status." };

const COMPONENTS = [
  { name: "pawos.app (this website)", status: "Operational" as const },
  { name: "Desktop app (Windows)", status: "Early access" as const },
  { name: "Checkout & billing", status: "Operational" as const },
];

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = {
  Operational: "green",
  "Early access": "amber",
};

export default function StatusPage() {
  return (
    <Section title="Status" subtitle="PawOS is primarily a desktop application, not a hosted service — so traditional uptime metrics don't apply the same way they would to a SaaS product.">
      <div className="mx-auto mt-12 max-w-xl space-y-4">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
            <span className="text-sm text-neutral-200">{c.name}</span>
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-neutral-500">
        PawOS runs on your computer, so most of it keeps working independently of these services.
      </p>
    </Section>
  );
}
