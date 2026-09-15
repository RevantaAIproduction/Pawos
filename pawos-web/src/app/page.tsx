import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../components/ui/Button";
import { ConnectionsWorkflow } from "../components/ConnectionsWorkflow";
import { HeroAnimation } from '../components/HeroAnimation';
import { ParticleField } from '../components/ParticleField';

export const metadata: Metadata = {
  title: "PawOS - The Desktop AI Work Environment",
  description: "PawOS connects the different parts of real computer work through one AI companion and execution layer.",
};

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
        <p className="text-2xl md:text-3xl text-neutral-400 font-light mb-12 max-w-2xl">
          The AI companion that gets work done.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button href="https://revantaai.com/downloads/pawos-windows.exe" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
            Download for Windows &rarr;
          </Button>
          <Button href="/about" variant="secondary" className="px-8 py-4 text-base font-medium bg-transparent text-white border border-neutral-700 hover:bg-neutral-900">
            Explore PawOS
          </Button>
        </div>
        </div>
      </section>

      {/* 2. WHAT PAWOS IS */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-8">
            The work is fragmented. The system shouldn't be.
          </h2>
          <p className="text-xl text-neutral-400 leading-relaxed max-w-3xl mx-auto">
            PawOS brings the work around your computer together. It acts as an execution layer between you and your tasks—bridging your files, projects, code, terminal, Git, and connected services into one cohesive environment.
          </p>
        </div>
      </section>

      {/* 3. UNDERSTAND / COMPANION (Image Left, Text Right) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <Image src="/pawos-companion-overview.png" alt="PawOS Companion interface" width={1920} height={1080} className="w-full object-cover" />
            </div>
            <div className="order-first md:order-last">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Start with what you need.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                PawOS sits on your desktop, ready to understand what you want to accomplish. Rather than forcing you to translate your goals into ten different tools, you tell PawOS what you're working on. It gathers the surrounding context and prepares to act.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. CODE CHANGES (Text Left, Image Right) */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white">
              The best way to build with agents
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div className="pt-12 order-first">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Built to drive real engineering work
              </h2>
              <p className="text-xl text-neutral-400 leading-relaxed">
                PawOS inspects your project, understands your request, and safely modifies your source code. From routine pull requests to your hardest problems, it reliably completes tasks end-to-end, applying the exact changes where they belong and reporting back what it achieved.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last">
              <Image src="/pawos-companion-code-changes.png" alt="PawOS making code changes" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 5. INSTALL SOFTWARE (Image Left, Text Right) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <Image src="/pawos-companion-install-python.png" alt="PawOS installing software" width={1920} height={1080} className="w-full object-cover" />
            </div>
            <div className="order-first md:order-last">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Take care of real work.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                Computer work extends beyond source code. When you need to install the latest stable Python release, PawOS understands the request, interacts with the environment, installs the required software, and verifies that it is available from your terminal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PATH FIX (Text Left, Image Right) */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="order-first">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Diagnose and fix.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                When a command fails because of a misconfigured environment, PawOS steps in. It investigates the broken state, identifies the missing PATH variables, applies the necessary fix, and verifies that the command now works successfully.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last">
              <Image src="/pawos-companion-path-fix.png" alt="PawOS fixing system PATH" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 7. JIRA INVESTIGATION (Image Left, Text Right) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <Image src="/pawos-companion-jira-ticket.png" alt="PawOS investigating a Jira ticket" width={1920} height={1080} className="w-full object-cover" />
            </div>
            <div className="order-first md:order-last">
              <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6 tracking-wide">
                AUTONOMOUS TICKET ENGINE
              </div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                From a ticket to a resolution.
              </h2>
              <p className="text-lg text-neutral-400 leading-relaxed">
                Hand PawOS a Jira ticket. It reads the requirements, gathers context from your repository, makes the necessary code changes, verifies them locally, and updates the ticket's state—connecting the external tracker directly to your local execution environment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. CROSS-CONNECTION */}
      <section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-5xl text-center mb-16 relative z-10">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Work doesn't live in one place.
          </h2>
          <p className="text-xl text-neutral-400 max-w-3xl mx-auto leading-relaxed">
            Your project may begin in a folder, continue in code, depend on a terminal command, pass through Git, and end with a ticket or message. PawOS is built to carry the context across those boundaries.
          </p>
        </div>
        
        <div className="mx-auto max-w-7xl mb-16">
          <ConnectionsWorkflow />
        </div>

        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl relative z-10">
          <Image src="/pawos-connections.png" alt="PawOS connections interface" width={1920} height={1080} className="w-full object-cover" />
        </div>
      </section>

      {/* 10. PRODUCT EVOLUTION (01 - 05) */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white mb-6">
              Where PawOS is today — and where we're taking it.
            </h2>
            <p className="text-xl text-neutral-400 max-w-3xl mx-auto leading-relaxed">
              PawOS already works across your desktop and engineering workflow. We're expanding the same execution layer to connect more of the work around it.
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
                  Work doesn't live in one place. A task may begin in a local project, require code changes, need terminal work, interact with Git, require ticket investigation, and eventually require updating connected systems. PawOS is the execution layer moving through that work.
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
              Why we're building PawOS.
            </h2>
          </div>
          <div className="prose prose-invert prose-lg mx-auto text-neutral-400 leading-relaxed mb-12">
            <p className="mb-6">
              We started building PawOS because we realized that giving an AI conversational access to a codebase isn't the same thing as giving an AI the ability to do the work.
            </p>
            <p className="mb-6">
              When a developer sits down at a computer, they don't just read code. They install dependencies, they navigate the file system, they run commands in the terminal, they debug failing builds, and they track their work in Jira. The work is connected.
            </p>
            <p>
              We are researching and building an execution platform that doesn't just chat, but actively bridges these fragmented systems—because the future of engineering isn't just an assistant that tells you what to type. It's a companion that understands your computer and acts as an autonomous extension of your environment.
            </p>
          </div>
          <div className="text-center">
            <Link href="/about" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-medium text-lg transition-colors">
              Read the full story <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 12. FINAL CTA */}
      <section className="py-32 px-6 text-center bg-neutral-950 relative z-10 border-t border-neutral-900">
        <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white mb-8">
          Your next task starts here.
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button href="https://revantaai.com/downloads/pawos-windows.exe" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
            Download for Windows &rarr;
          </Button>
          <Button href="/docs" variant="secondary" className="px-8 py-4 text-base font-medium bg-transparent text-white border border-neutral-700 hover:bg-neutral-900">
            Read Documentation
          </Button>
        </div>
      </section>
    </>
  );
}
