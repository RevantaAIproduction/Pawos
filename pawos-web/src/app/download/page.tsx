import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { CompanionPreview } from "../../components/companion-preview/CompanionPreview";
import { MiniCompanionCanvas } from "../../components/companion-preview/MiniCompanionCanvas";
import { OsDownloadPicker } from "./OsDownloadPicker";
import { getDownloadPlatforms, type DownloadPlatform } from "../../lib/config/downloadConfig";

export const metadata: Metadata = {
  title: "Download PawOS",
  description:
    "Download PawOS Desktop and see the real PawOS runtime surfaces for coding, execution, communication, office work, browser evidence, mobile presence, and the Paw companion.",
  openGraph: {
    title: "Download PawOS Desktop",
    description: "Direct PawOS website downloads and a product-first runtime showcase.",
    url: "/download",
  },
};

const DOWNLOAD_PLATFORMS = getDownloadPlatforms();

const SYSTEM_REQUIREMENTS = [
  { platform: "Windows", spec: "Windows 10 (64-bit) or later, 4 GB RAM minimum.", href: "/download/windows" },
  { platform: "macOS", spec: "macOS 12 Monterey or later, Apple Silicon or Intel.", href: "/download/macos" },
  { platform: "Linux", spec: "Modern glibc-based distribution such as Ubuntu 22.04+.", href: "/download/linux" },
];

const RUNTIME_TRUTH = [
  ["Coding", "Production workspace UI"],
  ["Planning", "Production task UI"],
  ["Communication", "Production workspace UI"],
  ["Office", "Production workspace regions"],
  ["Browser", "Task evidence UI"],
  ["Mobile", "Production PWA surfaces"],
  ["Companion", "Production site assets"],
];

function getPlatform(id: DownloadPlatform["id"]) {
  return DOWNLOAD_PLATFORMS.find((platform) => platform.id === id);
}

function primaryVariant(platform: DownloadPlatform) {
  return platform.variants.find((variant) => variant.status === "available" && variant.url) ?? platform.variants[0];
}

function ProductFrame({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#08090f]/95 shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-3">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
        </div>
        <p className="truncate text-xs font-semibold text-neutral-300">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "amber" | "red" }) {
  const toneClass = {
    neutral: "bg-white/10 text-neutral-300",
    blue: "bg-blue-300/20 text-blue-100",
    green: "bg-emerald-300/20 text-emerald-100",
    amber: "bg-amber-300/20 text-amber-100",
    red: "bg-rose-300/20 text-rose-100",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClass}`}>{children}</span>;
}

function ExplorerRow({ name, depth = 0, active = false, folder = false }: { name: string; depth?: number; active?: boolean; folder?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[12px_14px_minmax(0,1fr)] items-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] ${active ? "bg-blue-300/20 text-blue-100" : "text-neutral-300"}`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <span className="text-neutral-500">{folder ? ">" : ""}</span>
      <span className="text-neutral-500">{folder ? "[]" : "."}</span>
      <span className="truncate">{name}</span>
    </div>
  );
}

function TaskCardSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.05]">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Pill tone="blue">RUNNING</Pill>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">Validate the release build</span>
        <span className="text-[10px] text-neutral-500">4 actions</span>
      </div>
      <div className="space-y-2 border-t border-white/10 p-3">
        {[
          ["Preparation", "Read workspace context", "green"],
          ["Execution", "Run validation pipeline", "blue"],
          ["Approval", "Waiting only when required", "amber"],
          ["Verification", "Build and tests report back", "green"],
        ].slice(0, compact ? 3 : 4).map(([stage, text, tone]) => (
          <div key={stage} className="flex items-center gap-3 rounded-lg bg-white/[0.045] px-3 py-2">
            <span className={`h-2 w-2 rounded-full ${tone === "green" ? "bg-emerald-300" : tone === "amber" ? "bg-amber-300" : "bg-blue-300"}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{stage}</p>
              <p className="truncate text-xs text-neutral-200">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodingWorkspaceSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-2 bg-[#0a0a10]/90 p-2 ${compact ? "grid-cols-[0.75fr_1fr]" : "min-h-[520px] lg:grid-cols-[220px_minmax(260px,1fr)_300px] lg:grid-rows-[1fr_150px]"}`}>
      <aside className="min-h-0 rounded-xl border border-white/10 bg-white/[0.045]">
        <div className="flex items-center justify-between border-b border-white/10 p-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Project</p>
            <p className="text-xs font-bold text-neutral-100">PawOS</p>
          </div>
          <Pill>Clear</Pill>
        </div>
        {!compact && (
          <div className="grid grid-cols-[1fr_auto] gap-1 p-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-neutral-500">Search files</div>
            <Pill>Search</Pill>
          </div>
        )}
        <div className="p-2">
          <ExplorerRow name="PawOS" folder active />
          <ExplorerRow name="src" folder depth={1} />
          <ExplorerRow name="renderer" folder depth={2} />
          <ExplorerRow name="app" folder depth={3} active />
          <ExplorerRow name="download-page" depth={4} active />
          {!compact && <ExplorerRow name="release-config" depth={3} />}
        </div>
      </aside>

      <main className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          <p className="truncate text-sm font-bold text-neutral-100">Project workspace foundation</p>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Active File</p>
          <p className="mt-1 text-lg font-extrabold text-neutral-50">download-page</p>
          <p className="mt-3 text-[11.5px] leading-5 text-neutral-400">Navigation, project context, active file state, and runtime output are visible in the workspace.</p>
        </div>
      </main>

      {!compact && (
        <>
          <aside className="rounded-xl border border-white/10 bg-white/[0.045] p-3 lg:row-span-2">
            <TaskCardSurface compact />
            {["Project Understanding", "Live TODO Progress", "Build Status", "Test Results", "Coding Memory"].map((label) => (
              <div key={label} className="border-t border-white/10 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-300">{label}</p>
                <div className="mt-2 h-2 rounded-full bg-white/10">
                  <div className="h-2 w-2/3 rounded-full bg-blue-300/60" />
                </div>
              </div>
            ))}
          </aside>
          <section className="rounded-xl border border-white/10 bg-white/[0.045] lg:col-span-2">
            <div className="border-b border-white/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Terminal</p>
              <p className="text-xs font-bold text-neutral-100">Runtime output</p>
            </div>
            <pre className="m-0 h-28 overflow-auto bg-black/25 p-3 font-mono text-[11px] leading-5 text-neutral-300">{`$ npm run typecheck
 renderer TypeScript passed
 validation report saved`}</pre>
          </section>
        </>
      )}
    </div>
  );
}

function CommunicationSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-3 bg-[#0a0a10] p-4 ${compact ? "" : "md:grid-cols-[0.9fr_1.1fr]"}`}>
      <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_6px_#fb7185]" />
          <span className="text-xs font-bold text-neutral-100">Recording</span>
          <Pill tone="blue">Desktop capture</Pill>
        </div>
        <div className="mt-4">
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-2 w-3/5 rounded-full bg-rose-300" />
          </div>
          <div className="mt-3 flex justify-between text-xs text-neutral-400">
            <span>0:37</span>
            <span>audio evidence active</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-[11px] text-neutral-300">
          {["Avery", "Jordan", "Sam"].map((name) => <Pill key={name}>{name}</Pill>)}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Transcript</p>
        <div className="mt-3 space-y-2 text-xs text-neutral-300">
          <p><span className="text-neutral-500">00:12</span> We should ship the Windows build first.</p>
          <p><span className="text-neutral-500">00:26</span> Keep Linux direct download behind configured release URL.</p>
          <p><span className="text-neutral-500">00:34</span> macOS remains coming soon until a real build exists.</p>
        </div>
        {!compact && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-300/10 p-3 text-xs text-emerald-100">Decision detected</div>
            <div className="rounded-lg bg-blue-300/10 p-3 text-xs text-blue-100">Follow-up drafted</div>
          </div>
        )}
      </div>
    </div>
  );
}

function OfficeSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-3 bg-[#0a0a10] p-4 ${compact ? "" : "sm:grid-cols-2"}`}>
      {[
        ["Documents", "release-notes.docx", "Document created"],
        ["Spreadsheet", "usage-summary.xlsx", "Spreadsheet created"],
        ["Presentation", "launch-review.pptx", "Presentation created"],
        ["Email", "Draft waiting for confirmation", "Mail compose"],
        ["Recent Files", "3 office files", "Runtime memory"],
      ].slice(0, compact ? 3 : 5).map(([title, primary, meta]) => (
        <div key={title} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{title}</p>
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-neutral-100">{primary}</p>
          <p className="mt-1 text-xs text-neutral-500">{meta}</p>
        </div>
      ))}
      {!compact && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100">
          PawOS does not show a fake document editor here. It shows real output/status regions from the Office Runtime.
        </div>
      )}
    </div>
  );
}

function BrowserSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-[#0a0a10] p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.045]">
        <div className="flex items-center gap-2 border-b border-white/10 p-3">
          <Pill tone="blue">BROWSER</Pill>
          <div className="min-w-0 flex-1 rounded-full bg-black/25 px-3 py-1.5 font-mono text-[11px] text-neutral-400">https://example.test/release</div>
        </div>
        <div className={`grid gap-3 p-3 ${compact ? "" : "sm:grid-cols-[1.1fr_0.9fr]"}`}>
          <div className="rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="h-16 rounded-lg bg-white/[0.06]" />
            <div className="mt-3 h-2 w-4/5 rounded-full bg-white/10" />
            <div className="mt-2 h-2 w-2/3 rounded-full bg-white/10" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-10 rounded-lg bg-blue-300/10" />
              <div className="h-10 rounded-lg bg-emerald-300/10" />
            </div>
          </div>
          <div className="space-y-2">
            {["Navigate", "Extract page data", "Read console", "Capture screenshot"].map((item, index) => (
              <div key={item} className="flex items-center gap-2 rounded-lg bg-white/[0.045] px-3 py-2 text-xs text-neutral-300">
                <span className={`h-2 w-2 rounded-full ${index < 2 ? "bg-emerald-300" : "bg-blue-300"}`} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!compact && <p className="mt-3 text-xs text-neutral-500">Shown as task evidence because PawOS does not currently expose a separate browser IDE UI.</p>}
    </div>
  );
}

function ConversationControlSurface() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#10131c]/95 p-4 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Tell Paw</p>
          <p className="text-sm font-bold text-neutral-100">Control surface</p>
        </div>
        <div className="flex gap-2">
          <Pill tone="blue">Listen</Pill>
          <Pill>Send</Pill>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[#1a2436] p-3 text-xs leading-5 text-neutral-200">
        Prepare the release, verify the build, update the docs, and send me the result.
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-neutral-500">
        Type a message if speech input is unavailable
      </div>
    </div>
  );
}

function CompanionIdentitySurface() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Paw</p>
          <p className="text-sm font-bold text-neutral-100">Companion identity</p>
        </div>
        <Pill tone="blue">Desktop</Pill>
      </div>
      <div className="h-56 bg-[radial-gradient(circle_at_center,_rgba(96,165,250,0.16),_transparent_58%)]">
        <MiniCompanionCanvas />
      </div>
    </div>
  );
}

function VerifiedResultSurface() {
  return (
    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <p className="text-sm font-bold text-emerald-100">Verified Result</p>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-neutral-200">
        {["Build completed", "Renderer typecheck passed", "Download page updated", "Release notes ready"].map((item) => (
          <div key={item} className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
            <span className="text-emerald-200">+</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperatingLayerHeroVisual() {
  return (
    <div className="relative mx-auto mt-14 max-w-6xl rounded-[2rem] border border-white/10 bg-black/30 p-4 shadow-2xl shadow-black/40">
      <div className="mb-4 grid gap-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500 sm:grid-cols-5">
        <span>Goal</span>
        <span className="hidden text-blue-300 sm:block">-&gt;</span>
        <span>PawOS</span>
        <span className="hidden text-blue-300 sm:block">-&gt;</span>
        <span>Verified result</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.1fr_0.85fr]">
        <div className="space-y-4">
          <ConversationControlSurface />
          <CompanionIdentitySurface />
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Goal</p>
            <p className="mt-2 text-sm font-semibold text-neutral-100">User intent enters once. PawOS coordinates the work.</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-36 w-36 flex-col items-center justify-center rounded-[2rem] border border-white/15 bg-neutral-950/95 shadow-[0_0_70px_rgba(96,165,250,0.35)]">
            <Image src="/logo-icon.png" alt="" width={64} height={64} className="rounded-2xl" priority />
            <span className="mt-3 text-sm font-bold">PawOS</span>
            <span className="mt-1 text-[10px] text-neutral-500">Operating layer</span>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-200">Planning</p>
              <TaskCardSurface compact />
            </div>
            <VerifiedResultSurface />
          </div>
        </div>

        <div className="grid gap-3">
          <ProductFrame title="Workspace Runtime" className="shadow-none">
            <CodingWorkspaceSurface compact />
          </ProductFrame>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="h-40 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a10]">
              <OfficeSurface compact />
            </div>
            <div className="h-40 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a10]">
              <CommunicationSurface compact />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-neutral-400">
        Conversation is the entry point. PawOS operates through workspaces, applications, connected services, and verified outputs.
      </p>
    </div>
  );
}

function PhoneSurface() {
  return (
    <div className="w-60 rounded-[2.25rem] border border-white/15 bg-black p-3 shadow-2xl shadow-blue-950/40">
      <div className="rounded-[1.75rem] border border-white/10 bg-neutral-950 p-4">
        <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-white/20" />
        <div className="rounded-2xl bg-blue-300/15 p-4 text-blue-100">
          <p className="text-xs font-bold">PawOS Mobile</p>
          <p className="mt-1 text-[11px] text-blue-100/70">Desktop connected</p>
        </div>
        {[
          ["Pair device", "Trusted device"],
          ["Conversation", "Synced"],
          ["Notifications", "Enabled"],
          ["Approval center", "1 waiting"],
        ].map(([title, meta]) => (
          <div key={title} className="mt-3 rounded-2xl bg-white/[0.05] p-3">
            <p className="text-xs text-neutral-200">{title}</p>
            <p className="mt-1 text-[11px] text-neutral-500">{meta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileSurface() {
  return (
    <div className="grid gap-5 bg-[#0a0a10] p-5 md:grid-cols-[1fr_auto] md:items-center">
      <ProductFrame title="PawOS Desktop" className="shadow-none">
        <div className="p-4">
          <TaskCardSurface compact />
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
            Approval required: install update package?
          </div>
        </div>
      </ProductFrame>
      <div className="flex flex-col items-center gap-3">
        <div className="hidden h-px w-20 bg-gradient-to-r from-blue-300 to-emerald-300 md:block" />
        <PhoneSurface />
      </div>
    </div>
  );
}

function RuntimeMiniature({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wide text-neutral-400">{label}</p>
      <div className="h-52 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a10]">{children}</div>
    </div>
  );
}

function RuntimeOverview() {
  return (
    <section id="runtime-showcase" className="py-20">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Runtime showcase</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">A goal becomes work across runtimes.</h2>
          <p className="mt-5 text-neutral-400">
            Conversation is only the control surface. PawOS turns the goal into plans, workspace actions, application evidence, mobile approvals, and verified results.
          </p>
        </div>
        <div className="relative mx-auto mt-12 max-w-6xl rounded-[2rem] border border-white/10 bg-black/30 p-5">
          <div className="mx-auto mb-5 flex w-fit flex-col items-center">
            <Image src="/logo-icon.png" alt="" width={72} height={72} className="rounded-2xl" />
            <p className="mt-3 text-sm font-bold">PawOS</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <RuntimeMiniature label="Coding"><CodingWorkspaceSurface compact /></RuntimeMiniature>
            <RuntimeMiniature label="Office"><OfficeSurface compact /></RuntimeMiniature>
            <RuntimeMiniature label="Communication"><CommunicationSurface compact /></RuntimeMiniature>
            <RuntimeMiniature label="Browser"><BrowserSurface compact /></RuntimeMiniature>
            <RuntimeMiniature label="Planning"><div className="p-3"><TaskCardSurface compact /></div></RuntimeMiniature>
            <RuntimeMiniature label="Mobile"><div className="flex h-full items-center justify-center p-3"><PhoneSurface /></div></RuntimeMiniature>
          </div>
        </div>
      </Container>
    </section>
  );
}

function DownloadCard({ platform }: { platform: DownloadPlatform }) {
  const variant = primaryVariant(platform);
  const available = Boolean(variant?.status === "available" && variant.url);
  const isLinux = platform.id === "linux";
  const isMac = platform.id === "macos";

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 ${isMac && !available ? "opacity-85" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{available ? platform.label : "Coming soon"}</p>
      <h3 className="mt-1 text-xl font-bold text-neutral-50">{platform.label}</h3>
      <p className="mt-1 min-h-10 text-xs leading-5 text-neutral-400">
        {platform.id === "windows" && "For Windows 10 / 11 (64-bit)."}
        {platform.id === "linux" && "For Ubuntu 20.04+ / Debian 11+."}
        {platform.id === "macos" && "Stay tuned for the macOS release."}
      </p>
      {available && variant?.url ? (
        <a
          href={variant.url}
          className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 ${isLinux ? "bg-emerald-500" : "bg-blue-600"}`}
          rel="noopener noreferrer"
        >
          Download for {platform.label}
        </a>
      ) : (
        <span className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-neutral-400">
          Coming Soon
        </span>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-neutral-500">
        <span>SHA256</span>
        <Link href={`/download/${platform.id}`} className="text-blue-300 hover:underline">
          System Requirements
        </Link>
      </div>
    </div>
  );
}

function DownloadSection() {
  const windows = getPlatform("windows");
  const linux = getPlatform("linux");
  const macos = getPlatform("macos");

  return (
    <section id="desktop" className="py-20">
      <Container>
        <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl shadow-black/30">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.4fr] lg:items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300">Download PawOS</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight text-neutral-50">Get PawOS Desktop</h2>
              <p className="mt-4 text-sm leading-6 text-neutral-400">
                Download directly from pawos.revantaai.com. PawOS website downloads use configured release URLs only, with no Microsoft Store requirement.
              </p>
              <div className="mt-6 grid gap-3 text-[11px] text-neutral-400 sm:grid-cols-2">
                {["Secure by Design", "Runs Locally", "Direct Website Download", "Enterprise Ready"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <p className="font-semibold text-neutral-200">{item}</p>
                    <p className="mt-1 text-neutral-500">{item === "Runs Locally" ? "Private and offline capable" : item === "Direct Website Download" ? "No store redirect" : item === "Enterprise Ready" ? "Built for teams" : "Your data stays with you"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {windows && <DownloadCard platform={windows} />}
              {linux && <DownloadCard platform={linux} />}
              {macos && <DownloadCard platform={macos} />}
            </div>
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 text-xs text-neutral-400 md:grid-cols-4">
            {[
              ["No Microsoft Store", "PawOS is distributed directly from our website."],
              ["Verify Downloads", "Check the SHA256 hash for integrity."],
              ["Need Help?", "Visit documentation or contact support."],
              ["Updates", "You will be notified when updates are available."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl bg-white/[0.025] p-3">
                <p className="font-semibold text-neutral-200">{title}</p>
                <p className="mt-1 text-[11px] text-neutral-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10">
          <OsDownloadPicker />
        </div>
      </Container>
    </section>
  );
}

export default function DownloadPage() {
  const firstAvailable = DOWNLOAD_PLATFORMS.flatMap((platform) =>
    platform.variants
      .filter((variant) => variant.status === "available" && variant.url)
      .map((variant) => ({ platform, variant }))
  )[0];

  return (
    <div className="overflow-hidden bg-neutral-950 text-neutral-100">
      <section className="relative border-b border-white/10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.22),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_32%)]" />
        <Container className="relative py-20 sm:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <Image src="/logo-icon.png" alt="" width={72} height={72} className="mx-auto rounded-2xl" priority />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-blue-300">PawOS Desktop</p>
            <h1 className="mt-5 text-5xl font-bold tracking-tight text-balance sm:text-7xl">
              Give PawOS a goal. PawOS operates across your work.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
              PawOS is not just an answer box. Tell Paw what you want, then watch the operating layer plan, act through runtimes, and return verified results.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {firstAvailable?.variant.url ? (
                <Button href={firstAvailable.variant.url} external>
                  Download for {firstAvailable.platform.label}
                </Button>
              ) : (
                <Button href="#desktop">View Downloads</Button>
              )}
              <Button href="#runtime-showcase" variant="secondary">See PawOS UI</Button>
            </div>
          </div>
          <OperatingLayerHeroVisual />
        </Container>
      </section>

      <RuntimeOverview />

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Coding Runtime</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The goal becomes a project workspace.</h2>
          </div>
          <ProductFrame title="PawOS Coding Workspace">
            <CodingWorkspaceSurface />
          </ProductFrame>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Planning + Execution</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">The control surface becomes a task lifecycle.</h2>
              <div className="mt-8">
                <ProductFrame title="PawOS Task Card">
                  <div className="p-4"><TaskCardSurface /></div>
                </ProductFrame>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Communication Intelligence</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Meetings become evidence, transcript, speakers.</h2>
              <div className="mt-8">
                <ProductFrame title="PawOS Communication Workspace">
                  <CommunicationSurface />
                </ProductFrame>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Office Runtime</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Office work appears as files, drafts, and recent output.</h2>
              <div className="mt-8">
                <ProductFrame title="PawOS Office Runtime">
                  <OfficeSurface />
                </ProductFrame>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Browser Runtime</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Browser work becomes navigation and evidence.</h2>
              <div className="mt-8">
                <ProductFrame title="PawOS Browser Evidence">
                  <BrowserSurface />
                </ProductFrame>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <ProductFrame title="Desktop PawOS to Mobile PawOS">
              <MobileSurface />
            </ProductFrame>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Mobile Presence</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Desktop PawOS, connected to mobile.</h2>
              <p className="mt-5 text-neutral-400">
                Pairing, trusted device state, conversation sync, notifications, and approval center are shown as mobile connectivity surfaces. The phone reviews and responds; it does not independently execute desktop actions.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Universal Companion</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The real PawOS companion belongs inside the product.</h2>
              <p className="mt-5 text-neutral-400">
                This section uses the existing PawOS companion preview and bundled companion animation assets.
              </p>
            </div>
            <CompanionPreview />
          </div>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-200">How this showcase stays truthful</summary>
            <div className="mt-5 grid gap-3 text-sm text-neutral-400 md:grid-cols-2">
              {RUNTIME_TRUTH.map(([runtime, status]) => (
                <div key={runtime} className="rounded-xl bg-black/20 p-3">
                  <p className="font-semibold text-neutral-100">{runtime}</p>
                  <p className="mt-1 text-xs text-neutral-500">{status}</p>
                </div>
              ))}
            </div>
          </details>
        </Container>
      </section>

      <DownloadSection />

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
            PawOS Desktop downloads stay direct from the website.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-400">
            Windows and Linux download only when configured release URLs exist. macOS remains coming soon unless a real macOS release URL is configured.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button href="#desktop">View Downloads</Button>
            <Button href="/docs" variant="secondary">Read Docs</Button>
          </div>
        </Container>
      </section>
    </div>
  );
}
