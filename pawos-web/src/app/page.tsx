'use client';
import Image from "next/image";
import Link from "next/link";
import { Button } from "../components/ui/Button";
import { ConnectionsWorkflow } from "../components/ConnectionsWorkflow";
import { HeroAnimation } from '../components/HeroAnimation';
import { ParticleField } from '../components/ParticleField';
import { EarlyAccessSection } from '../components/early-access/EarlyAccessSection';
import { trackEvent } from "../components/analytics/Analytics";

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
        <h1 className="mx-auto max-w-5xl text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6">
          Engineering work, carried through.
        </h1>
        <p className="mx-auto max-w-3xl text-lg md:text-2xl text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.85)] font-light mb-10">
          PawOS helps developers plan and carry out supported engineering tasks, with a clear view of the work and its results. Choose Desktop for your Windows environment, CLI for a local project folder, or Web for chat and GitHub-connected work.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/signup" onClick={() => trackEvent("home_get_started", { destination: "/signup" })} className="rounded-full bg-white px-8 py-4 text-base font-medium text-black transition hover:bg-neutral-200">
            Get Started <span aria-hidden="true">→</span>
          </Link>
          <Link href="/features" onClick={() => trackEvent("features_index_visit", { source: "home_hero" })} className="rounded-full border border-white/25 px-8 py-4 text-base font-medium text-white transition hover:bg-white/10">
            Explore Product
          </Link>
        </div>
        </div>
      </section>

      {/* 2. WHAT PAWOS IS */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-8">
            Engineering work crosses tools. PawOS helps connect the steps.
          </h2>
          <p className="text-xl text-neutral-400 leading-relaxed max-w-3xl mx-auto">
            A code change can involve understanding a project, editing files, running commands and reporting the result. PawOS supports that work in three distinct ways: Desktop on Windows, CLI in a local project folder, and Web for browser chat and GitHub-connected repository changes.
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
                PawOS Web offers browser-based Chat and Code modes. In Code mode, connect GitHub, choose a repository and describe a change. Web works with the connected repository; it does not access your computer&apos;s files or terminal.
              </p>
              <ol className="mt-8 space-y-3">
                {[
                  ["Connect GitHub", "Sign in with GitHub — from your computer or your phone."],
                  ["Pick a repository", "Choose the repo Paw should work in."],
                  ["Describe the change", "Review the proposed change and its available checks."],
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
                <video controls playsInline preload="metadata" width={1072} height={576} poster="/pawos-product-demo-poster.webp" onPlay={() => trackEvent("demo_video_play", { video: "shopflow_storefront" })} className="block h-auto w-full" aria-label="ShopFlow e-commerce live preview built with PawOS" aria-describedby="shopflow-video-description">
                  <source src="/pawos-product-demo.mp4" type="video/mp4" />
                  Your browser does not support embedded video.
                </video>
                <figcaption id="shopflow-video-description" className="border-t border-neutral-800 px-4 py-3 text-sm text-neutral-300">ShopFlow storefront live preview, showing the product cards and store navigation.</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-black shadow-2xl">
                <video controls playsInline preload="metadata" width={832} height={448} poster="/pawos-product-demo-2-poster.webp" onPlay={() => trackEvent("demo_video_play", { video: "shopflow_cli" })} className="block h-auto w-full" aria-label="PawOS CLI proposing a source file edit in the local ShopFlow project" aria-describedby="shopflow-cli-video-description">
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
            Desktop, CLI and Web each support different parts of an engineering workflow. Here is what is available today and what we are still working toward.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-32">
            
            {/* 01 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">01</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">A companion that executes real work.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  On Windows, PawOS Desktop can work with supported local projects and development tools. Depending on the task and permissions, it can inspect files, make changes, run commands, install software and help repair environment issues.
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
                  We are improving how people review work in PawOS. The details shown depend on the experience and task; check the current product and documentation for what is available.
                </p>
                <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Review the task plan before work begins</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>See command output and reported results</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Approve actions that require confirmation</div>
                  <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-white/20"></span>Choose the experience that fits the project</div>
                </div>
              </div>
            </div>

            {/* 03 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">03</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Expanding across connections.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  A task may involve a local project, terminal commands, Git and a connected issue tracker. PawOS can help with supported steps, but the actions available depend on the product experience and each connection.
                </p>
              </div>
            </div>

            {/* 04 */}
            <div className="flex flex-col md:flex-row gap-8 items-baseline">
              <div className="text-5xl font-light text-neutral-700 w-24 flex-shrink-0">04</div>
              <div>
                <h3 className="text-3xl font-medium text-white mb-4">Autonomous execution.</h3>
                <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                  PawOS includes ticket-based workflows for supported plans and connected services. They can stop when a step needs approval or a required capability is unavailable; they do not guarantee a fix or pull request for every ticket.
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
                  Team and Enterprise features add organization workspaces, administration and governance. Availability depends on plan and configuration; contact the team to discuss an organization rollout.
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
            Tools that help move engineering work forward.
          </h2>
          <p className="text-2xl text-neutral-400 font-light max-w-4xl mx-auto leading-relaxed">
            PawOS is focused on engineering tasks that span a project, its tools and connected services. We are building toward more continuity between those steps, while keeping each experience within its supported access and permissions.
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
              We started PawOS because discussing a code change and carrying it out are different jobs.
            </p>
            <p className="mb-6">
              When a developer sits down at a computer, they don&apos;t just read code. They install dependencies, they navigate the file system, they run commands in the terminal, they debug failing builds, and they track their work in Jira. The work is connected.
            </p>
            <p>
              PawOS is being built to help with the steps between a request and a checked result. It can work with local projects in Desktop or CLI, and with connected repositories in Web. Each experience has its own boundaries, and PawOS reports what it could and could not verify.
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
