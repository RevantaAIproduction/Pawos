'use client';
import Image from "next/image";
import Link from "next/link";
import { Button } from "../components/ui/Button";
import { ConnectionsWorkflow } from "../components/ConnectionsWorkflow";
import { HeroAnimation } from '../components/HeroAnimation';
import { ParticleField } from '../components/ParticleField';
import { EarlyAccessSection } from '../components/early-access/EarlyAccessSection';

type ProductScreenshotProps = {
  src: string;
  mobileSrc: string;
  alt: string;
  width: number;
  height: number;
};

function ProductScreenshot({ src, mobileSrc, alt, width, height }: ProductScreenshotProps) {
  return (
    <picture className="block w-full">
      <source media="(max-width: 767px)" srcSet={mobileSrc} />
      <Image src={src} alt={alt} width={width} height={height} sizes="(min-width: 768px) 50vw, 100vw" className="block h-auto w-full object-contain" />
    </picture>
  );
}


export default function Home() {
  return (
    <>
      {/* 1. HERO */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6">
        <HeroAnimation />
        <ParticleField />
        <div className="relative z-10">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-6">
          PawOS
        </h1>
        <p className="text-2xl md:text-3xl text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.85)] font-light mb-12 max-w-2xl">
          One AI work companion. Desktop, CLI, and Web.
        </p>
        <div className="flex justify-center">
          <a href="#early-access" className="px-8 py-4 text-base font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition">
            Get Early Access &rarr;
          </a>
        </div>
        </div>
      </section>

      {/* 2. WHAT PAWOS IS */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-8">
            The work is fragmented. The system shouldn&apos;t be.
          </h2>
          <p className="text-xl text-neutral-400 leading-relaxed max-w-3xl mx-auto">
            PawOS brings task context across the tools you use through three product experiences: a graphical desktop app, a CLI for local project folders, and a browser-based Web app for chat and connected repository workflows.
          </p>
        </div>
      </section>

      {/* 3. UNDERSTAND / COMPANION (Image Left, Text Right) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <ProductScreenshot src="/pawos-desktop-capture.png" mobileSrc="/pawos-desktop-mobile.webp" alt="PawOS Desktop open with the task prompt and companion workspace" width={1000} height={764} />
              <a href="/pawos-desktop-capture.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full desktop screenshot</a>
            </div>
            <div className="order-first md:order-last">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Start with what you need.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                PawOS Desktop gives you a graphical place to start a task, continue a conversation, and work with projects. Use the desktop app when you want PawOS alongside your local environment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. CLI CODE CHANGES (Text Left, Image Right) */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white">
              From a request to reviewed changes
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div className="pt-12 order-first">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                A terminal interface for local projects
              </h2>
              <p className="text-xl text-neutral-400 leading-relaxed">
                PawOS CLI works from a local project folder. It can inspect the project, propose a plan, request approval for file changes or commands, and report the checks it ran.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last">
              <ProductScreenshot src="/pawos-cli-edits.png" mobileSrc="/pawos-cli-edits-mobile.webp" alt="PawOS CLI showing project file edits and successful lint and build commands" width={1166} height={642} />
              <a href="/pawos-cli-edits.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full CLI screenshot</a>
            </div>
          </div>
        </div>
      </section>

      {/* 4b. PAWOS WEB (Text Left, Product capture Right) */}
      <section className="py-32 px-6 bg-neutral-950 border-t border-neutral-900 relative z-10" aria-labelledby="continue-from-web">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-4">PawOS Web</p>
              <h2 id="continue-from-web" className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Select your repo and start coding from the web.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                PawOS Web is a browser-based experience for chat and connected repository work. In Code mode, connect GitHub, select a repository, and describe a change. Web does not access files on your computer.
              </p>
              <ol className="mt-8 space-y-3">
                {[
                  ["Connect GitHub", "Sign in with GitHub — from your computer or your phone."],
                  ["Pick a repository", "Choose the repo Paw should work in."],
                  ["Describe the change", "Watch each step, then open the live preview."],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-xs font-semibold text-neutral-300">{index + 1}</span>
                    <span>
                      <span className="block text-base font-medium text-white">{title}</span>
                      <span className="block text-sm text-neutral-400">{detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/app" className="px-6 py-3 text-sm font-medium bg-white text-black rounded-full hover:bg-neutral-200 transition">
                  Open PawOS Web
                </Link>
                <Link href="/docs/getting-started/web-and-mobile" className="text-sm font-medium text-neutral-300 hover:text-white transition">
                  How it works &rarr;
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full space-y-4">
              <figure className="overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl">
                <ProductScreenshot src="/pawos-web-chat.png" mobileSrc="/pawos-web-chat-mobile.webp" alt="PawOS Web Chat mode in a desktop browser" width={1490} height={697} />
                <figcaption className="sr-only">PawOS Web Chat mode</figcaption>
                <a href="/pawos-web-chat.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full Web Chat screenshot</a>
              </figure>
              <figure className="overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl">
                <ProductScreenshot src="/pawos-web-code.png" mobileSrc="/pawos-web-code-mobile.webp" alt="PawOS Web Code mode showing the GitHub connection and repository setup steps" width={1493} height={697} />
                <figcaption className="sr-only">PawOS Web Code mode</figcaption>
                <a href="/pawos-web-code.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full Web Code screenshot</a>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* 5. PAWOS CLI (Image Left, Text Right) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <ProductScreenshot src="/pawos-cli-start.png" mobileSrc="/pawos-cli-start-mobile.webp" alt="PawOS CLI showing the detected local folder, branch, repository, and prompt" width={725} height={361} />
              <a href="/pawos-cli-start.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full CLI screenshot</a>
            </div>
            <div className="order-first md:order-last">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Work from the folder you choose.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                The CLI starts by identifying the current folder, Git branch, and repository. You can then describe a task in the terminal and review the proposed work before proceeding.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CLI CHECKS (Text Left, Image Right) */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="order-first">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                See the checks that ran.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                The terminal asks before running the lint command and shows it in progress. A separate PawOS CLI capture records the lint and build results.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last">
              <ProductScreenshot src="/pawos-cli-validation.png" mobileSrc="/pawos-cli-validation-mobile.webp" alt="PawOS CLI asking approval to run npm run lint" width={1162} height={632} />
              <a href="/pawos-cli-validation.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 md:hidden">View the full CLI screenshot</a>
            </div>
          </div>
        </div>
      </section>

      {/* 7. PRODUCT DEMO */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="order-last md:order-first space-y-5">
              <figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-black shadow-2xl">
                <video controls playsInline preload="metadata" width={1072} height={576} poster="/pawos-product-demo-poster.webp" className="block h-auto w-full" aria-label="ShopFlow e-commerce live preview built with PawOS" aria-describedby="shopflow-video-description">
                  <source src="/pawos-product-demo.mp4" type="video/mp4" />
                  Your browser does not support embedded video.
                </video>
                <figcaption id="shopflow-video-description" className="border-t border-neutral-800 px-4 py-3 text-sm text-neutral-300">ShopFlow storefront live preview, showing the product cards and store navigation.</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-black shadow-2xl">
                <video controls playsInline preload="metadata" width={832} height={448} poster="/pawos-product-demo-2-poster.webp" className="block h-auto w-full" aria-label="PawOS CLI proposing a source file edit in the local ShopFlow project" aria-describedby="shopflow-cli-video-description">
                  <source src="/pawos-cli-shopflow-demo.mp4" type="video/mp4" />
                  Your browser does not support embedded video.
                </video>
                <figcaption id="shopflow-cli-video-description" className="border-t border-neutral-800 px-4 py-3 text-sm text-neutral-300">PawOS CLI proposing an edit to <code>src/App.css</code> in the local ShopFlow project.</figcaption>
              </figure>
            </div>
            <div className="order-first md:order-last">
              <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6 tracking-wide">
                PRODUCT RECORDING
              </div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                PawOS in action.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                The first recording shows the ShopFlow e-commerce live preview built with PawOS. The second shows PawOS CLI preparing an edit in the local ShopFlow project. Use each player&apos;s controls to review the recordings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. CROSS-CONNECTION */}
      <section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-5xl text-center mb-16 relative z-10">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Work doesn&apos;t live in one place.
          </h2>
          <p className="text-xl text-neutral-400 max-w-3xl mx-auto leading-relaxed">
            Your project may begin in a folder, continue in code, depend on a terminal command, pass through Git, and end with a ticket or message. PawOS is built to carry the context across those boundaries. Connected services expose different actions, depending on each integration.
          </p>
        </div>
        
        <div className="mx-auto max-w-7xl mb-16">
          <ConnectionsWorkflow />
        </div>

        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl relative z-10">
          <picture className="block w-full">
            <source media="(max-width: 639px)" srcSet="/pawos-connections-mobile.webp" />
            <Image src="/pawos-connections-capture.png" alt="PawOS Desktop Connections page showing integration cards and their displayed connection states" width={1255} height={336} sizes="(min-width: 1024px) 80vw, 100vw" className="block h-auto w-full object-contain" />
          </picture>
          <a href="/pawos-connections-capture.png" target="_blank" rel="noreferrer" className="block px-4 py-3 text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-4 sm:hidden">View the full Connections screenshot</a>
        </div>
      </section>

      {/* 10. PRODUCT EVOLUTION (01 - 05) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white mb-6">
              Where PawOS is today — and where we&apos;re taking it.
            </h2>
            <p className="text-xl text-neutral-400 max-w-3xl mx-auto leading-relaxed">
              PawOS already works across your desktop and engineering workflow. We&apos;re expanding the same execution layer to connect more of the work around it.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-32">
            
            {/* 01 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">01</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">A companion that executes real work.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  PawOS already operates as a desktop AI companion and execution environment. It can explore codebases, make code changes, work with the terminal, install software, and fix development environment issues.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Understand an existing project</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Change and refactor code</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Install software and configure environments</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Fix paths and development issues</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Run commands and verify results</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Work with Git and project files</div>
                </div>
              </div>
            </div>

            {/* 02 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">02</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Deepening the working environment.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  We are building a richer workspace around the execution layer. This is about making execution more visible—bringing the work PawOS already does to the surface.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Richer inline file and code viewers</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Clearer real diffs and verification</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Persistent terminal and work output</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Stronger project context</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>More isolated execution environments</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Richer execution history</div>
                </div>
              </div>
            </div>

            {/* 03 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">03</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Expanding across connections.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  Work doesn&apos;t live in one place. A task may begin in a local project, require code changes, need terminal work, interact with Git, require ticket investigation, and eventually require updating connected systems. PawOS is the execution layer moving through that work.
                </p>
              </div>
            </div>

            {/* 04 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">04</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Autonomous execution.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  Autonomous ticket work is part of PawOS today, not a future capability. PawOS can take supported tasks from request through execution and reporting. It operates with strict execution controls, requiring appropriate approval and permission boundaries around the work.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium tracking-wide text-neutral-500 uppercase">
                  <span>Request</span>
                  <span>→</span>
                  <span>Understand</span>
                  <span>→</span>
                  <span>Plan</span>
                  <span>→</span>
                  <span>Approve</span>
                  <span>→</span>
                  <span className="text-white">Execute</span>
                  <span>→</span>
                  <span>Verify</span>
                  <span>→</span>
                  <span>Report</span>
                </div>
              </div>
            </div>

            {/* 05 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">05</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Organizational direction.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  This is where the genuinely future organizational expansion belongs. Building on existing foundations for authentication and billing, we are expanding PawOS to support the administration, collaboration, and governance required for larger teams.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Collaborative PawOS workspaces</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Granular RBAC and policies</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Enterprise SSO and delegated access</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Budgets and execution controls</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Organization-wide connected workflows</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Deeper team collaboration</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 06 - LARGE CONCEPTUAL STATEMENT */}
      <section className="py-40 px-6 bg-black relative z-10 border-t border-neutral-900 flex flex-col items-center justify-center text-center">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-10 leading-tight">
            A computer that understands the work around you.
          </h2>
          <p className="text-2xl text-neutral-400 font-light max-w-4xl mx-auto leading-relaxed">
            The long-term idea is larger than coding. The goal is not to replace every underlying tool. The goal is to make the tools and systems people already use work together through an intelligent execution layer. A system that connects people, projects, files, software, tools, execution, communication, and organizations.
          </p>
        </div>
      </section>

      {/* 11. BUILDERS / STORY PREVIEW */}
      <section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
              Why we&apos;re building PawOS.
            </h2>
          </div>
          <div className="prose prose-invert prose-lg mx-auto text-neutral-400 leading-relaxed mb-12">
            <p className="mb-6">
              We started building PawOS because we realized that giving an AI conversational access to a codebase isn&apos;t the same thing as giving an AI the ability to do the work.
            </p>
            <p className="mb-6">
              When a developer sits down at a computer, they don&apos;t just read code. They install dependencies, they navigate the file system, they run commands in the terminal, they debug failing builds, and they track their work in Jira. The work is connected.
            </p>
            <p>
              We are researching and building an execution platform that doesn&apos;t just chat, but actively bridges these fragmented systems—because the future of engineering isn&apos;t just an assistant that tells you what to type. It&apos;s a companion that understands your computer and acts as an autonomous extension of your environment.
            </p>
          </div>
          <div className="text-center">
            <Link href="/about" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-medium text-lg transition-colors">
              Read the full story <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* EARLY ACCESS */}
      <EarlyAccessSection />

      {/* 12. FINAL CTA */}
      <section className="py-32 px-6 text-center bg-neutral-950 relative z-10 border-t border-neutral-900">
        <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white mb-8">
          Your next task starts here.
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <a href="#early-access" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
            Get Early Access &rarr;
          </a>
          <Button href="/docs" variant="secondary" className="px-8 py-4 text-base font-medium bg-transparent text-white border border-neutral-700 hover:bg-neutral-900">
            Read Documentation
          </Button>
        </div>
      </section>
    </>
  );
}
