import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";
import { CompanionPreview } from "../../components/companion-preview/CompanionPreview";
import { OsDownloadPicker } from "./OsDownloadPicker";
import { getDownloadPlatforms, type DownloadPlatform } from "../../lib/config/downloadConfig";

export const metadata: Metadata = {
  title: "Download PawOS",
  description:
    "Download PawOS Desktop and see the real PawOS runtime surfaces across coding, office work, communication, browser automation, planning, execution, mobile presence, and companion workflows.",
  openGraph: {
    title: "Download PawOS Desktop",
    description:
      "Direct PawOS website downloads and an honest runtime showcase built from existing PawOS UI surfaces.",
    url: "/download",
  },
};

const DOWNLOAD_PLATFORMS = getDownloadPlatforms();

const REAL_UI_MAP = [
  {
    runtime: "Coding Runtime",
    source: "src/renderer/workspace/WorkspaceRuntime.tsx",
    status: "Production renderer UI exists",
    detail:
      "Project explorer, root switching, file search, active-file state, context panel, and terminal output come from the real WorkspaceRuntime shell.",
  },
  {
    runtime: "Office Runtime",
    source: "WorkspaceRuntime office regions and src/main/execution/plugins/office",
    status: "Production renderer regions exist",
    detail:
      "Documents, email, office timeline, and recent office files are rendered by the existing workspace runtime when office actions produce real data.",
  },
  {
    runtime: "Communication Intelligence",
    source: "src/renderer/communication/CommunicationWorkspaceRuntime.tsx",
    status: "Production renderer UI exists",
    detail:
      "Recording state, evidence timing, participants, transcript, speaker timeline, action items, decisions, and visual context only appear from real events.",
  },
  {
    runtime: "Planning + Execution",
    source: "src/renderer/conversation/TaskCard.tsx",
    status: "Production renderer UI exists",
    detail:
      "Task stages, execution plans, approval pauses, validation, terminal output, files touched, errors, and final reports are rendered by TaskCard.",
  },
  {
    runtime: "Browser Runtime",
    source: "src/main/execution/browser and browser plugins",
    status: "Backend and task-card evidence exist",
    detail:
      "Navigation, extraction, console, network, screenshots, uploads, downloads, and PDF capture surface through real task evidence. No standalone polished browser runtime UI is claimed here.",
  },
  {
    runtime: "Mobile Presence",
    source: "pawos-web/src/app/companion and src/renderer/mobilePresence",
    status: "Production website and renderer bridge exist",
    detail:
      "Pairing, trusted-device presence, notifications, conversation sync, and mobile approval center are represented by the existing companion PWA components.",
  },
  {
    runtime: "Universal Companion",
    source: "pawos-web/src/components/companion-preview and src/renderer/ui/CompanionCanvas",
    status: "Production visuals exist",
    detail:
      "The public site uses the existing PawOS companion preview assets. The desktop renderer owns the live companion canvas.",
  },
];

const SYSTEM_REQUIREMENTS = [
  { platform: "Windows", spec: "Windows 10 (64-bit) or later, 4 GB RAM minimum.", href: "/download/windows" },
  { platform: "macOS", spec: "macOS 12 Monterey or later, Apple Silicon or Intel.", href: "/download/macos" },
  { platform: "Linux", spec: "Modern glibc-based distribution such as Ubuntu 22.04+.", href: "/download/linux" },
];

function primaryVariant(platform: DownloadPlatform) {
  return platform.variants.find((variant) => variant.status === "available" && variant.url) ?? platform.variants[0];
}

function getPlatform(id: DownloadPlatform["id"]) {
  return DOWNLOAD_PLATFORMS.find((platform) => platform.id === id);
}

function RuntimeWindow({
  title,
  source,
  children,
  className = "",
}: {
  title: string;
  source: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a10]/90 shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-semibold text-neutral-200">{title}</p>
          <p className="truncate text-[10px] text-neutral-500">{source}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SourceBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-neutral-300">
      {children}
    </span>
  );
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

function CodingRuntimeVisual() {
  return (
    <RuntimeWindow title="Coding Runtime / WorkspaceRuntime" source="src/renderer/workspace/WorkspaceRuntime.tsx">
      <div className="grid min-h-[520px] gap-2 bg-[#0a0a10]/90 p-2 lg:grid-cols-[220px_minmax(260px,1fr)_300px] lg:grid-rows-[1fr_150px]">
        <aside className="min-h-0 rounded-xl border border-white/10 bg-white/[0.045]">
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Project</p>
              <p className="text-xs font-bold text-neutral-100">PawOS</p>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-neutral-300">Clear</span>
          </div>
          <div className="flex gap-1 p-2">
            <span className="rounded-full bg-blue-300/20 px-2 py-1 text-[10px] font-bold text-blue-100">PawOS</span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-neutral-300">web</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-1 p-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-neutral-500">Search files</div>
            <div className="rounded-full bg-white/10 px-2 py-1.5 text-[10px] font-bold text-neutral-300">Search</div>
          </div>
          <div className="p-2">
            <ExplorerRow name="PawOS" folder active />
            <ExplorerRow name="src" folder depth={1} />
            <ExplorerRow name="renderer" folder depth={2} />
            <ExplorerRow name="workspace" folder depth={3} active />
            <ExplorerRow name="WorkspaceRuntime.tsx" depth={4} active />
            <ExplorerRow name="workspaceRuntime.module.css" depth={4} />
          </div>
        </aside>

        <main className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
          <div className="border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              <p className="truncate text-sm font-bold text-neutral-100">Wire project workspace foundation</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Active File</p>
            <p className="mt-1 text-lg font-extrabold text-neutral-50">WorkspaceRuntime.tsx</p>
            <p className="font-mono text-[11px] text-neutral-500">src/renderer/workspace</p>
            <p className="mt-3 text-[11.5px] leading-5 text-neutral-400">
              File viewing and diffs are reserved for the next workspace phase. Phase A keeps navigation and project context live against real runtime APIs.
            </p>
          </div>
        </main>

        <aside className="rounded-xl border border-white/10 bg-white/[0.045] p-3 lg:row-span-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.05]">
            <div className="flex items-center gap-2 p-3">
              <span className="rounded-full bg-blue-300/20 px-2 py-1 text-[10px] font-bold text-blue-100">RUNNING</span>
              <span className="truncate text-xs font-bold text-neutral-100">Validate TypeScript</span>
            </div>
            <div className="border-t border-white/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Execution Plan</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] text-neutral-300">
                <li>Read project context</li>
                <li>Apply minimal test-only fix</li>
                <li>Run validation pipeline</li>
              </ol>
            </div>
          </div>
          {["Project Understanding", "Live TODO Progress", "Build Status", "Test Results", "Coding Memory"].map((label) => (
            <div key={label} className="border-t border-white/10 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-300">{label}</p>
              <p className="mt-1 text-[11.5px] text-neutral-500">Shown only when real action data exists.</p>
            </div>
          ))}
        </aside>

        <section className="rounded-xl border border-white/10 bg-white/[0.045] lg:col-span-2">
          <div className="border-b border-white/10 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Terminal</p>
            <p className="text-xs font-bold text-neutral-100">Runtime output</p>
          </div>
          <pre className="m-0 h-28 overflow-auto bg-black/25 p-3 font-mono text-[11px] leading-5 text-neutral-300">{`$ npm run typecheck:renderer
 renderer TypeScript passed
 validation report saved to Coding Runtime Memory`}</pre>
        </section>
      </div>
    </RuntimeWindow>
  );
}

function TaskCardVisual() {
  return (
    <RuntimeWindow title="Planning + Execution / TaskCard" source="src/renderer/conversation/TaskCard.tsx">
      <div className="space-y-4 bg-[#0a0a10] p-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.05]">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="rounded-full bg-blue-300/20 px-2 py-1 text-[10px] font-bold text-blue-100">RUNNING</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">Run production verification</span>
            <span className="text-[10px] text-neutral-500">5 stages</span>
          </div>
          <div className="space-y-3 border-t border-white/10 p-3">
            {["Preparation", "Execution", "Verification"].map((stage) => (
              <div key={stage} className="rounded-lg bg-white/[0.05] px-3 py-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-neutral-300">
                  <span>{stage}</span>
                  <span className="text-neutral-500">real action trail</span>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
              Waiting to Connect or waiting for approval appears as a pause, not a fabricated success state.
            </div>
          </div>
        </div>
      </div>
    </RuntimeWindow>
  );
}

function CommunicationVisual() {
  return (
    <RuntimeWindow title="Communication Workspace" source="src/renderer/communication/CommunicationWorkspaceRuntime.tsx">
      <div className="mx-auto max-w-md space-y-3 bg-[#0a0a10] p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_6px_#fb7185]" />
          <span className="text-xs font-bold text-neutral-100">Recording</span>
          <span className="ml-auto rounded-full bg-blue-300/20 px-2 py-1 text-[10px] font-semibold text-blue-100">Desktop capture</span>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Evidence</p>
          <p className="text-sm text-neutral-200">0:37</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Transcript</p>
          <div className="mt-1 max-h-28 space-y-1 overflow-auto text-[11.5px] text-neutral-300">
            <p>Live transcript appears only after transcript events are received.</p>
            <p>Speaker timeline is derived after processing completes.</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Decisions and action items</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-neutral-300">
            <li>Rendered from detected runtime events.</li>
            <li>No meeting SDK participant screen is simulated.</li>
          </ul>
        </div>
      </div>
    </RuntimeWindow>
  );
}

function OfficeVisual() {
  return (
    <RuntimeWindow title="Office Runtime Regions" source="WorkspaceRuntime officeDocuments / officeEmail / recentOfficeFiles">
      <div className="grid gap-3 bg-[#0a0a10] p-4 sm:grid-cols-2">
        {[
          ["Documents", "Created documents, spreadsheets, presentations, and merged PDFs appear only after a real outputPath exists."],
          ["Email", "Drafted or confirmed email state appears from existing mail action results."],
          ["Office Timeline", "Recent office files are read from the existing Office Runtime store."],
          ["Honest gaps", "There is no separate fake Office editor on this page."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-300">{title}</p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">{body}</p>
          </div>
        ))}
      </div>
    </RuntimeWindow>
  );
}

function BrowserVisual() {
  return (
    <RuntimeWindow title="Browser Runtime Evidence" source="src/main/execution/browser and Browser Runtime plugins">
      <div className="space-y-3 bg-[#0a0a10] p-4">
        {[
          "Open or reuse a real browser session",
          "Navigate, read, click, fill, upload, download, print, and screenshot",
          "Console, network, and screenshot evidence surface in TaskCard and WorkspaceRuntime",
          "No standalone polished browser runtime UI exists yet, so this showcase does not invent one",
        ].map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-xs text-neutral-300">
            {item}
          </div>
        ))}
      </div>
    </RuntimeWindow>
  );
}

function MobileVisual() {
  return (
    <RuntimeWindow title="Mobile Presence PWA" source="pawos-web/src/app/companion and src/renderer/mobilePresence">
      <div className="grid gap-4 bg-[#0a0a10] p-4 sm:grid-cols-[0.9fr_1.1fr]">
        <div className="mx-auto w-56 rounded-[2rem] border border-white/15 bg-black p-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-neutral-950 p-4">
            <div className="mx-auto mb-4 h-1 w-14 rounded-full bg-white/20" />
            {["Pair this device", "Trusted device required", "Conversation sync", "Approval center"].map((item, index) => (
              <div key={item} className={`mb-3 rounded-2xl p-3 text-xs ${index === 0 ? "bg-blue-300/15 text-blue-100" : "bg-white/[0.05] text-neutral-300"}`}>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[
            "Presence starts only after a real trusted_devices id is stored by pairing.",
            "Notifications and sync use the existing companion PWA components.",
            "Approvals publish approvalResponse events back to the desktop; the phone does not execute actions itself.",
          ].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-xs leading-5 text-neutral-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    </RuntimeWindow>
  );
}

function DownloadCard({ platform }: { platform: DownloadPlatform }) {
  const variant = primaryVariant(platform);
  const available = Boolean(variant?.status === "available" && variant.url);
  const isLinux = platform.id === "linux";
  const isMac = platform.id === "macos";

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 ${isMac ? "opacity-85" : ""}`}>
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
          Notify me
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
                Install PawOS on your machine and connect it to your workspace. PawOS is distributed directly from this website; no Microsoft Store redirect is used here.
              </p>
              <div className="mt-6 grid gap-3 text-[11px] text-neutral-400 sm:grid-cols-2">
                {["Secure by Design", "Runs Locally", "Always Evolving", "Enterprise Ready"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <p className="font-semibold text-neutral-200">{item}</p>
                    <p className="mt-1 text-neutral-500">{item === "Runs Locally" ? "Private and offline capable" : item === "Always Evolving" ? "Frequent updates" : item === "Enterprise Ready" ? "Built for teams" : "Your data stays with you"}</p>
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
              The real PawOS product, ready from the web.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
              Download PawOS Desktop and see the runtime surfaces as they exist in the product: workspace, task cards, communication capture, office regions, browser evidence, mobile presence, and the Paw companion.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {firstAvailable?.variant.url ? (
                <Button href={firstAvailable.variant.url} external>
                  Download for {firstAvailable.platform.label}
                </Button>
              ) : (
                <Button href="#desktop">View Downloads</Button>
              )}
              <Button href="#runtime-showcase" variant="secondary">See Runtime UI</Button>
            </div>
          </div>
        </Container>
      </section>

      <section id="runtime-showcase" className="py-20">
        <Container>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Runtime showcase</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Mapped to existing PawOS UI.</h2>
              <p className="mt-5 text-neutral-400">
                These visuals are based on existing PawOS renderer and website components. Where a runtime has backend capability but no polished production UI, the page says so instead of inventing a screen.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SourceBadge>Real components</SourceBadge>
              <SourceBadge>No fake screenshots</SourceBadge>
              <SourceBadge>Website-only presentation</SourceBadge>
            </div>
          </div>

          <div className="mt-12">
            <CodingRuntimeVisual />
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <TaskCardVisual />
            <CommunicationVisual />
            <OfficeVisual />
            <BrowserVisual />
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Universal companion</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">The PawOS companion uses real site assets.</h2>
              <p className="mt-5 text-neutral-400">
                This preview uses the existing PawOS companion preview component and bundled companion animation assets. It is not a generated replacement screenshot.
              </p>
            </div>
            <CompanionPreview />
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <MobileVisual />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Mobile Presence</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">Mobile connectivity is shown only where implemented.</h2>
              <p className="mt-5 text-neutral-400">
                Pairing, trusted-device presence, conversation sync, notifications, and approvals are represented from existing mobile presence components and bridges. The phone never claims to execute desktop actions itself.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-neutral-900/30 py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Source mapping</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">What is real UI, and what is not claimed.</h2>
          </div>
          <div className="mt-12 grid gap-4">
            {REAL_UI_MAP.map((item) => (
              <div key={item.runtime} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:grid-cols-[0.7fr_0.7fr_1.6fr]">
                <div>
                  <p className="text-sm font-semibold text-neutral-100">{item.runtime}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.status}</p>
                </div>
                <p className="font-mono text-[11px] leading-5 text-blue-200">{item.source}</p>
                <p className="text-sm leading-6 text-neutral-400">{item.detail}</p>
              </div>
            ))}
          </div>
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
            Windows and Linux use configured PawOS release URLs when present. macOS remains coming soon unless a real macOS release URL is configured.
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
