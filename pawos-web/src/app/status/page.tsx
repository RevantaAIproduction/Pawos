import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = { title: "Status", description: "PawOS product availability and service status information." };

const COMPONENTS = [
  { name: "pawos.revantaai.com (this website)", status: "Operational" as const },
  { name: "Desktop app (Windows)", status: "Early access" as const },
  { name: "Checkout & billing", status: "Operational" as const },
];

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = {
  Operational: "green",
  "Early access": "amber",
};

export default function StatusPage() {
  return (
    <Section title="Status" subtitle="PawOS includes browser-based services and local applications. This page describes product access; it is not a live uptime monitor or a substitute for incident reporting.">
      <div className="mx-auto mt-12 max-w-xl space-y-4">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="flex items-center justify-between rounded-lg border border-neutral-800 p-4">
            <span className="text-sm text-neutral-200">{c.name}</span>
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-8 max-w-xl text-center text-sm text-neutral-500">
        Local CLI and Desktop workflows run in their respective environments. Features that use PawOS services or connected providers depend on those services being available.
      </p>
    </Section>
  );
}
