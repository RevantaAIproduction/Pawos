import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { OsDownloadPicker } from "./OsDownloadPicker";
import { getDownloadPlatforms } from "../../lib/config/downloadConfig";

export const metadata: Metadata = {
  title: "Download PawOS",
  description:
    "Download PawOS, the AI operating system for work: one operating layer across coding, communication, documents, intelligence, execution, and mobile presence.",
  openGraph: {
    title: "PawOS - The AI Operating System for Work",
    description:
      "A premium product overview and download page for PawOS, the desktop AI operating layer for real work.",
    url: "/download",
  },
};

const RUNTIMES = [
  "Coding Runtime",
  "Office Runtime",
  "Universal Execution",
  "Communication Intelligence",
  "Mobile Presence",
  "Browser Runtime",
  "Intelligence Runtime",
  "Planning + Execution",
];

const CONNECTORS = [
  "GitHub",
  "GitLab",
  "Linear",
  "Jira",
  "Slack",
  "Google Workspace",
  "Vercel",
  "Netlify",
  "Railway",
];

const SYSTEM_REQUIREMENTS = [
  { platform: "Windows", spec: "Windows 10 (64-bit) or later, 4 GB RAM minimum.", href: "/download/windows" },
  { platform: "macOS", spec: "macOS 12 Monterey or later, Apple Silicon or Intel.", href: "/download/macos" },
  { platform: "Linux", spec: "Modern glibc-based distribution such as Ubuntu 22.04+.", href: "/download/linux" },
];

const ALL_DOWNLOADS = getDownloadPlatforms();
const AVAILABLE_VARIANT = ALL_DOWNLOADS.flatMap((platform) =>
  platform.variants.map((variant) => ({ platform, variant }))
).find(({ variant }) => variant.status === "available" && variant.url);

function MiniWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-neutral-950/80 shadow-2xl shadow-black/40 backdrop-blur ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
        </div>
        <span className="text-xs font-medium text-neutral-400">{title}</span>
      </div>
      {children}
    </div>
  );
}

function HeroSystemVisual() {
  return (
    <div className="relative mx-auto mt-16 max-w-6xl" aria-label="PawOS operating layer visualization">
      <div aria-hidden className="absolute inset-0 rounded-[3rem] bg-[radial-gradient(circle_at_center,_rgba(96,165,250,0.24),_transparent_62%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950/70 p-5 shadow-2xl shadow-blue-950/30 backdrop-blur">
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(120deg,rgba(59,130,246,0.12),transparent_35%,rgba(16,185,129,0.10)_65%,transparent)]" />
        <div className="relative grid min-h-[640px] gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
          <div className="grid gap-4">
            <RuntimeChip label="Coding Runtime" detail="Files, diffs, tests" />
            <RuntimeChip label="Office Runtime" detail="Docs, sheets, decks" />
            <RuntimeChip label="Browser Runtime" detail="Navigate and extract" />
          </div>

          <div className="relative flex min-h-[360px] items-center justify-center">
            <div aria-hidden className="absolute h-72 w-72 rounded-full border border-blue-300/20 bg-blue-500/5" />
            <div aria-hidden className="absolute h-96 w-96 rounded-full border border-emerald-300/10" />
            <div className="relative z-10 flex h-44 w-44 flex-col items-center justify-center rounded-[2rem] border border-white/15 bg-neutral-950/90 shadow-[0_0_80px_rgba(96,165,250,0.35)]">
              <Image src="/logo-icon.png" alt="" width={72} height={72} className="rounded-2xl" priority />
              <span className="mt-4 text-lg font-semibold">PawOS</span>
              <span className="mt-1 text-xs text-neutral-500">Operating layer</span>
            </div>
            {RUNTIMES.map((runtime, index) => (
              <div
                key={runtime}
                className="absolute hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-neutral-300 shadow-lg backdrop-blur sm:block"
                style={{
                  transform: `rotate(${index * 45}deg) translateY(-205px) rotate(-${index * 45}deg)`,
                }}
              >
                {runtime}
              </div>
            ))}
          </div>

          <div className="grid gap-4">
            <RuntimeChip label="Communication Intelligence" detail="Recording, transcript, evidence" />
            <RuntimeChip label="Mobile Presence" detail="Desktop plus mobile continuity" />
            <RuntimeChip label="Planning + Execution" detail="Goal, approval, validation" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RuntimeChip({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition duration-300 hover:-translate-y-1 hover:border-blue-300/40 hover:bg-blue-400/[0.06]">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-blue-300 shadow-[0_0_18px_rgba(147,197,253,0.85)]" />
        <h3 className="text-sm font-semibold text-neutral-100">{label}</h3>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-400">{detail}</p>
    </div>
  );
}

function CodingPreview() {
  return (
    <MiniWindow title="Coding Workspace" className="h-full">
      <div className="grid min-h-[360px] grid-cols-[0.75fr_1.35fr] gap-0">
        <div className="border-r border-white/10 p-4 text-xs text-neutral-400">
          {["src", "renderer", "workspace", "TaskCard.tsx", "RuntimeMemory.ts"].map((item, index) => (
            <div key={item} className={`mb-2 rounded-md px-2 py-1 ${index === 2 ? "bg-blue-400/10 text-blue-200" : ""}`}>
              {index < 3 ? "+ " : "- "}
              {item}
            </div>
          ))}
        </div>
        <div className="grid grid-rows-[1fr_auto]">
          <div className="p-4 font-mono text-xs leading-6 text-neutral-300">
            <p><span className="text-emerald-300">+</span> validateProjectWorkspace()</p>
            <p><span className="text-rose-300">-</span> stalePlaceholderState()</p>
            <p><span className="text-blue-300">+</span> runValidationPipeline()</p>
            <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-emerald-100">
              Tests passed. Validation report saved to Coding Runtime Memory.
            </p>
          </div>
          <div className="border-t border-white/10 bg-black/30 p-4 font-mono text-[11px] text-neutral-400">
            <p>$ npm test</p>
            <p className="text-emerald-300">752 passed</p>
          </div>
        </div>
      </div>
    </MiniWindow>
  );
}

function CommunicationPreview() {
  return (
    <MiniWindow title="Communication Intelligence">
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_1.1fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="h-2 rounded-full bg-blue-300/30">
            <div className="h-2 w-3/5 rounded-full bg-blue-300" />
          </div>
          <p className="mt-3 text-xs text-neutral-500">Recording remains the source of truth.</p>
          <div className="mt-5 space-y-3">
            {["00:04 Intro", "12:18 Decision", "24:42 Risk", "31:09 Follow-up"].map((item) => (
              <div key={item} className="rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-300">{item}</div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {["Transcript linked to speakers", "Evidence-backed decisions", "Opportunities and risks", "Follow-up draft for review"].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-neutral-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    </MiniWindow>
  );
}

function OfficePreview() {
  return (
    <MiniWindow title="Office Runtime">
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {[
          ["Document", "Review notes, sections, edits"],
          ["Spreadsheet", "Rows, formulas, summaries"],
          ["Presentation", "Slides, bullets, speaker notes"],
        ].map(([title, body], index) => (
          <div key={title} className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
            <div className={`mb-4 h-20 rounded-lg ${index === 0 ? "bg-blue-300/10" : index === 1 ? "bg-emerald-300/10" : "bg-violet-300/10"}`} />
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-neutral-400">{body}</p>
          </div>
        ))}
      </div>
    </MiniWindow>
  );
}

function DesktopPreview() {
  return (
    <MiniWindow title="PawOS Desktop">
      <div className="grid min-h-[430px] gap-4 p-5 lg:grid-cols-[0.8fr_1.3fr_0.9fr]">
        <div className="space-y-3">
          {["Workspace", "Tasks", "Connections", "Settings"].map((item, index) => (
            <div key={item} className={`rounded-xl px-4 py-3 text-sm ${index === 0 ? "bg-blue-400/15 text-blue-100" : "bg-white/[0.04] text-neutral-400"}`}>
              {item}
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Active task</p>
              <p className="mt-2 text-sm font-semibold">Validate release checklist</p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-2 w-3/4 rounded-full bg-emerald-300" />
              </div>
            </div>
            <div className="rounded-xl bg-neutral-900 p-4">
              <p className="text-xs text-neutral-500">Companion</p>
              <div className="mt-4 flex items-center gap-3">
                <Image src="/logo-icon.png" alt="" width={48} height={48} className="rounded-xl" />
                <span className="text-sm text-neutral-300">Paw is listening</span>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950 p-4 font-mono text-xs text-neutral-400">
            <p>$ git status</p>
            <p className="text-blue-300">Workspace clean. Ready for review.</p>
          </div>
        </div>
        <div className="space-y-3">
          {["GitHub connected", "Google Workspace ready", "Approval queue empty", "Mobile paired"].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-neutral-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    </MiniWindow>
  );
}

export default function DownloadPage() {
  const downloadHref = AVAILABLE_VARIANT?.variant.url ?? "#desktop";
  const downloadCta = AVAILABLE_VARIANT ? `Download for ${AVAILABLE_VARIANT.platform.label}` : "Download PawOS";

  return (
    <div className="overflow-hidden bg-neutral-950 text-neutral-100">
      <section className="relative">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.26),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_30%)]" />
        <Container className="relative py-20 sm:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300">PawOS</p>
            <h1 className="mt-6 text-5xl font-bold tracking-tight text-balance sm:text-7xl">
              The AI Operating System for Work.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
              One operating layer connecting coding, communication, documents, intelligence, execution, browser work,
              and mobile presence. PawOS is not another chat window. It coordinates the way work actually happens.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {AVAILABLE_VARIANT ? (
                <Button href={downloadHref} external>{downloadCta}</Button>
              ) : (
                <Button href="#desktop">{downloadCta}</Button>
              )}
              <Button href="#operating-layer" variant="secondary">Explore PawOS</Button>
            </div>
            {!AVAILABLE_VARIANT && (
              <p className="mt-5 text-sm text-neutral-500">Desktop app coming soon. Availability is shown from the current build configuration below.</p>
            )}
          </div>
          <HeroSystemVisual />
        </Container>
      </section>

      <section id="operating-layer" className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">One system</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Every runtime converges into PawOS.</h2>
              <p className="mt-5 text-neutral-400">
                PawOS is built from focused runtimes that share one execution surface: visible plans, user approval for
                risky actions, real outputs, and honest completion state.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {RUNTIMES.map((runtime) => (
                <div key={runtime} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-neutral-300 transition hover:border-blue-300/40">
                  {runtime}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Coding Runtime</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Paw builds, edits, tests, and validates software.</h2>
            <p className="mt-5 text-neutral-400">
              Coding work surfaces as project context, file changes, terminal output, validation status, and Coding Runtime Memory.
            </p>
          </div>
          <div className="mt-12"><CodingPreview /></div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Communication Intelligence</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Meetings become timestamp-linked intelligence.</h2>
              <p className="mt-5 text-neutral-400">
                PawOS represents the recording as the source of truth, then connects transcript, speakers, evidence,
                decisions, risks, opportunities, and follow-ups back to that timeline.
              </p>
            </div>
            <CommunicationPreview />
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <OfficePreview />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Office Runtime</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Create and work with documents, spreadsheets, and presentations.</h2>
              <p className="mt-5 text-neutral-400">
                PawOS includes real document, spreadsheet, and presentation actions. It creates files, analyzes sheet data,
                and keeps generated work inspectable.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ["Universal Runtime", "Give Paw a goal. Paw coordinates files, apps, processes, shell output, and recovery through one auditable execution engine."],
              ["Browser + Intelligence", "Paw can navigate a real browser, extract structured data, and compose repository, website, product, UX, marketing, and founder reports from real evidence."],
              ["Planning + Execution", "Goal to plan, approval, execution, validation, and result. Risky actions pause for confirmation instead of running silently."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-neutral-950/70 p-6 transition hover:-translate-y-1 hover:border-blue-300/40">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Mobile Presence</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Your work does not stop when you leave your desk.</h2>
              <p className="mt-5 text-neutral-400">
                PawOS includes a mobile companion PWA foundation with pairing, trusted-device presence, conversation sync,
                notifications, and an approval center for reviewing pending confirmations.
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-6">
              <div className="hidden flex-1 rounded-3xl border border-white/10 bg-neutral-900 p-5 shadow-2xl sm:block">
                <DesktopPreview />
              </div>
              <div className="w-56 rounded-[2.25rem] border border-white/15 bg-black p-3 shadow-2xl shadow-blue-950/40">
                <div className="rounded-[1.75rem] border border-white/10 bg-neutral-950 p-4">
                  <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-white/20" />
                  {["PawOS Mobile", "Conversation synced", "Approval waiting", "Desktop connected"].map((item, index) => (
                    <div key={item} className={`mb-3 rounded-2xl p-3 text-xs ${index === 0 ? "bg-blue-400/15 text-blue-100" : "bg-white/[0.05] text-neutral-300"}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Connectors</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Works with the tools your organization already uses.</h2>
            <p className="mt-5 text-neutral-400">
              PawOS connects through the existing connector platform. Credentials and OAuth flows stay routed through the product connector runtime.
            </p>
          </div>
          <div className="relative mx-auto mt-12 max-w-5xl rounded-[2rem] border border-white/10 bg-neutral-950/70 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {CONNECTORS.map((connector) => (
                <div key={connector} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-medium text-neutral-200 transition hover:border-emerald-300/40">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  {connector}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section id="desktop" className="py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <DesktopPreview />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">PawOS Desktop</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The desktop app is where the operating layer lives.</h2>
              <p className="mt-5 text-neutral-400">
                Workspace, companion, runtimes, tasks, activity, settings, and connections all meet in the desktop experience.
                Current public build availability is controlled by the configured release URLs below.
              </p>
              <div className="mt-8">
                {AVAILABLE_VARIANT ? (
                  <Button href={downloadHref} external>{downloadCta}</Button>
                ) : (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
                    <h3 className="font-semibold text-amber-100">Desktop app coming soon</h3>
                    <p className="mt-2 text-sm text-neutral-400">
                      No public installer URL is configured for this build yet. Explore PawOS while release artifacts are prepared.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button href="#operating-layer" variant="secondary">Explore PawOS</Button>
                      <Button href="/docs" variant="ghost">Read docs</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-14">
            <OsDownloadPicker />
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-6 sm:grid-cols-3">
            {SYSTEM_REQUIREMENTS.map((requirement) => (
              <Link key={requirement.platform} href={requirement.href} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-blue-300/40">
                <h3 className="font-semibold">{requirement.platform}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{requirement.spec}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-20 text-center">
        <Container>
          <Image src="/logo-icon.png" alt="" width={64} height={64} className="mx-auto rounded-2xl" />
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            PawOS is the operating layer connecting your entire way of working.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {AVAILABLE_VARIANT ? (
              <Button href={downloadHref} external>{downloadCta}</Button>
            ) : (
              <Button href="#desktop">Desktop app coming soon</Button>
            )}
            <Button href="/features" variant="secondary">Explore features</Button>
          </div>
        </Container>
      </section>
    </div>
  );
}
