import type { Metadata } from "next";
import { Section } from "../../components/ui/Section";
import { Badge } from "../../components/ui/Badge";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's shipped in PawOS, in order.",
};

type Entry = { date: string; tag: "Feature" | "Fix" | "Security" | "Breaking"; title: string; body: string };

const ENTRIES: Entry[] = [
  {
    date: "2026-07-23",
    tag: "Feature",
    title: "20+ real deployment providers",
    body: "The Infrastructure Runtime now covers Vercel, Netlify, Railway, Render, Fly.io, GitHub Pages, Hostinger (shared + VPS), Google Cloud Run, AWS Elastic Beanstalk, Azure App Service, Kubernetes, plus real cloud-VM provisioning for AWS EC2, Google Compute Engine, Azure VM, DigitalOcean, Linode, Vultr, Hetzner, Oracle Cloud, and Docker/VPS.",
  },
  {
    date: "2026-07-23",
    tag: "Feature",
    title: "Success-gated Autonomous Engineering Task billing",
    body: "Billing now only ever fires on a genuinely completed run (real PR + updated ticket) — never on deploy alone, and never on failure, cancellation, retry-limit, or denied approval.",
  },
  {
    date: "2026-07-19",
    tag: "Feature",
    title: "Companion Runtime complete",
    body: "The 3D companion stack is now authoritative: automatic rigging, procedural motion, live facial expression, personality presets, and export/import as a portable .paw package.",
  },
  {
    date: "2026-07-18",
    tag: "Feature",
    title: "Communication Runtime frozen for Phase 1",
    body: "Desktop-first meeting/call capture, transcription, and follow-up drafting reached a stable baseline; further work is bug-fixes only until the next planned phase.",
  },
  {
    date: "2026-07-16",
    tag: "Feature",
    title: "Browser Runtime frozen for Phase 1",
    body: "Navigation, extraction, form-filling, and the comparison workflow reached a stable baseline; a WorkflowMetadata extension point was added for higher-level runtimes to build on.",
  },
];

const TAG_TONE: Record<Entry["tag"], "blue" | "green" | "amber" | "neutral"> = {
  Feature: "blue",
  Fix: "green",
  Security: "amber",
  Breaking: "neutral",
};

export default function ChangelogPage() {
  return (
    <Section title="Changelog" subtitle="A real, chronological record of what's shipped — most recent first.">
      <div className="mx-auto mt-12 max-w-2xl space-y-8">
        {ENTRIES.map((e) => (
          <div key={e.title} className="border-b border-neutral-900 pb-8">
            <div className="flex items-center gap-3">
              <Badge tone={TAG_TONE[e.tag]}>{e.tag}</Badge>
              <time className="text-sm text-neutral-500" dateTime={e.date}>{e.date}</time>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-neutral-100">{e.title}</h2>
            <p className="mt-2 text-neutral-400">{e.body}</p>
          </div>
        ))}
        <p className="pt-4 text-center text-sm text-neutral-500">
          This changelog covers major, user-visible milestones — not every internal commit. Versioned releases (once
          published) will follow semantic versioning; see the Versioning doc for detail.
        </p>
      </div>
    </Section>
  );
}
