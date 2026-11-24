"use client";

import Image from "next/image";
import Link from "next/link";
import { DownloadWindowsButton } from "../components/DownloadWindowsButton";
import { trackEvent } from "../components/analytics/Analytics";

const products = [
  {
    name: "PawOS CLI",
    label: "Local terminal workflow",
    description: "Start PawOS from a project folder and work with local files, Git or non-Git projects, and approved development commands.",
    href: "/docs/getting-started/four-ways-to-work#install-cli",
    image: "/pawos-cli-edits.png",
    alt: "PawOS CLI showing proposed local file changes and lint and build command results",
  },
  {
    name: "PawOS Desktop",
    label: "Windows development environment",
    description: "Use the Windows desktop application for supported local project, development-tool and environment workflows. Availability and actions depend on the release, setup and permissions.",
    href: "/features/desktop-ai",
    image: "/pawos-desktop-capture.png",
    alt: "PawOS Desktop application showing its local development workspace",
  },
  {
    name: "PawOS Web",
    label: "Browser and GitHub workflows",
    description: "Use Chat and Code in a browser. Code works with repositories you connect through GitHub; Web does not access your computer's local files or terminal.",
    href: "/docs/getting-started/web-and-mobile",
    image: "/pawos-web-code.png",
    alt: "PawOS Web Code mode showing GitHub repository connection and setup",
  },
];

const workflow = [
  ["01", "Describe the outcome", "Start with the engineering task: investigate a defect, understand a project, or make a defined change."],
  ["02", "Inspect and plan", "PawOS uses the project context and tools available in the selected experience to determine a supported approach."],
  ["03", "Review and authorize", "Review proposed work. Actions that require confirmation pause for approval before they run."],
  ["04", "Execute and verify", "PawOS carries out supported steps and reports the commands, changes, checks, failures and items it could not verify."],
];

export default function Home() {
  return (
    <main className="bg-[#080a0d] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.16),transparent_58%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-32 sm:pt-40 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:pb-28">
          <div>
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">AI engineering execution</p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Delegate engineering work. Review what gets done.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-300 sm:text-xl">
              PawOS helps developers investigate issues, understand projects, plan code changes and carry out supported engineering tasks. Work from a local terminal, a Windows desktop workspace or a browser connected to GitHub.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/signup" onClick={() => trackEvent("home_primary_cta", { destination: "/signup" })} className="inline-flex items-center rounded-lg bg-white px-5 py-3.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200">
                Get started <span aria-hidden="true" className="ml-2">→</span>
              </Link>
              <Link href="/docs/getting-started/four-ways-to-work" className="inline-flex items-center rounded-lg border border-white/20 px-5 py-3.5 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5">
                Read the developer guide
              </Link>
            </div>
            <p className="mt-5 text-sm text-neutral-500">Three product experiences. Different execution boundaries. One PawOS account.</p>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-blue-500/10 blur-2xl" />
            <figure className="relative overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl shadow-black/40">
              <Image src="/pawos-desktop-capture.png" alt="PawOS Desktop application showing the product workspace" width={1000} height={764} priority className="h-auto w-full object-contain" sizes="(min-width: 1024px) 48vw, 100vw" />
              <figcaption className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-3 text-xs text-neutral-400">
                <span>PawOS Desktop · Product screenshot</span>
                <span>Windows</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0c0f14] px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">The engineering workflow</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Software work is more than writing code.</h2>
            <p className="mt-5 text-base leading-7 text-neutral-400 sm:text-lg">
              A change can involve reading an issue, understanding an unfamiliar codebase, tracing an error, editing files, running commands and checking the result. PawOS is designed to help coordinate those steps within the capabilities of the product experience you choose.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(([number, title, detail]) => (
              <article key={number} className="bg-[#0c0f14] p-6 sm:p-7">
                <p className="font-mono text-xs text-blue-300">{number}</p>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Choose your environment</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Three ways to work with PawOS.</h2>
              <p className="mt-5 text-base leading-7 text-neutral-400 sm:text-lg">Choose the experience based on where the project lives and where the work needs to run.</p>
            </div>
            <Link href="/docs/getting-started/four-ways-to-work" className="text-sm font-semibold text-blue-300 transition hover:text-blue-200">Compare all three experiences →</Link>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.name} className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0f14]">
                <div className="border-b border-white/10 bg-black/30 p-3">
                  <Image src={product.image} alt={product.alt} width={1493} height={697} className="h-auto w-full rounded-lg object-contain" sizes="(min-width: 1024px) 33vw, 100vw" />
                </div>
                <div className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">{product.label}</p>
                  <h3 className="mt-3 text-xl font-semibold">{product.name}</h3>
                  <p className="mt-3 min-h-24 text-sm leading-6 text-neutral-400">{product.description}</p>
                  <Link href={product.href} className="mt-5 inline-flex text-sm font-semibold text-white hover:text-blue-200">Explore {product.name} <span aria-hidden="true" className="ml-2">→</span></Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0c0f14] px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Execution you can inspect</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">A result should come with evidence.</h2>
            <p className="mt-5 text-base leading-7 text-neutral-400 sm:text-lg">
              PawOS reports the work it performed and the checks it ran. Review file changes, command output, validation results, failures and remaining work before relying on a task outcome.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-neutral-300">
              {["Review proposed changes before execution where supported", "Approve actions that require confirmation", "See command and tool outcomes", "Distinguish passed, failed and unverified checks"].map((item) => (
                <li key={item} className="flex gap-3"><span className="mt-0.5 text-blue-300">✓</span><span>{item}</span></li>
              ))}
            </ul>
            <Link href="/docs/security/permissions" className="mt-8 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">Read about permissions and execution safety →</Link>
          </div>
          <figure className="overflow-hidden rounded-xl border border-white/10 bg-black">
            <Image src="/pawos-cli-validation.png" alt="PawOS CLI showing a request to approve a lint command" width={1162} height={632} className="h-auto w-full object-contain" sizes="(min-width: 1024px) 55vw, 100vw" />
            <figcaption className="border-t border-white/10 px-4 py-3 text-xs text-neutral-500">PawOS CLI · Approval before running a development check</figcaption>
          </figure>
        </div>
      </section>

      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Start with your workflow</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Use the right PawOS experience for the task.</h2>
          </div>
          <div className="mt-9 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-white/10 p-6">
              <h3 className="font-semibold">Local project work</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-400">Install the CLI, open a project folder and start PawOS from your terminal. Local project work does not require a Git repository.</p>
              <pre className="mt-5 overflow-x-auto rounded-lg border border-white/10 bg-black p-4 text-xs text-neutral-300"><code>npm install -g @revantaai/pawos-cli{"\n"}pawos</code></pre>
              <Link href="/docs/getting-started/four-ways-to-work#install-cli" className="mt-5 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">CLI installation guide →</Link>
            </article>
            <article className="rounded-xl border border-white/10 p-6">
              <h3 className="font-semibold">Browser-based work</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-400">Open PawOS Web for browser chat and supported coding tasks on repositories connected through GitHub.</p>
              <Link href="/app" className="mt-5 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">Open PawOS Web →</Link>
            </article>
            <article className="rounded-xl border border-white/10 p-6">
              <h3 className="font-semibold">Windows environment work</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-400">Request Windows early access for the Desktop experience. The available installer and release status are confirmed through the access process.</p>
              <DownloadWindowsButton source="home_windows_card" className="mt-5 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200">Request Windows access →</DownloadWindowsButton>
            </article>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0c0f14] px-6 py-20 text-center sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Bring a real engineering task.</h2>
          <p className="mt-5 text-base leading-7 text-neutral-400 sm:text-lg">Explore the product, check the supported workflows and decide where PawOS fits in your development process.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="rounded-lg bg-white px-5 py-3.5 text-sm font-semibold text-neutral-950 hover:bg-neutral-200">Create an account</Link>
            <Link href="/docs" className="rounded-lg border border-white/20 px-5 py-3.5 text-sm font-semibold text-white hover:bg-white/5">Browse documentation</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
