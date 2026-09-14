import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../components/ui/Button";
import { ConnectionsGraphic } from "../components/ConnectionsGraphic";
import { HeroAnimation } from "../components/HeroAnimation";

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
        <div className="relative z-10">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-6">
          PawOS
        </h1>
        <p className="text-2xl md:text-3xl text-neutral-400 font-light mb-12 max-w-2xl">
          The AI companion that gets work done.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
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

      {/* 3. UNDERSTAND / COMPANION */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Start with what you need.
              </h2>
              <p className="text-lg text-neutral-400">
                PawOS sits on your desktop, ready to understand what you want to accomplish. Rather than forcing you to translate your goals into ten different tools, you tell PawOS what you're working on. It gathers the surrounding context and prepares to act.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative">
              <Image src="/pawos-companion-overview.png" alt="PawOS Companion interface" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 4. CODE CHANGES */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white">
              The best way to build with agents
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div className="pt-12">
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Built to drive real engineering work
              </h2>
              <p className="text-xl text-neutral-400 leading-relaxed">
                PawOS inspects your project, understands your request, and safely modifies your source code. From routine pull requests to your hardest problems, it reliably completes tasks end-to-end, applying the exact changes where they belong and reporting back what it achieved.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative">
              <Image src="/pawos-companion-code-changes.png" alt="PawOS making code changes" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 5. INSTALL SOFTWARE */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Take care of real work.
              </h2>
              <p className="text-lg text-neutral-400">
                Computer work extends beyond source code. When you need to install the latest stable Python release, PawOS understands the request, interacts with the environment, installs the required software, and verifies that it is available from your terminal.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative">
              <Image src="/pawos-companion-install-python.png" alt="PawOS installing software" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 6. PATH FIX */}
      <section className="py-32 px-6 bg-black relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative order-last md:order-first">
              <Image src="/pawos-companion-path-fix.png" alt="PawOS fixing system PATH" width={1920} height={1080} className="w-full object-cover" />
            </div>
            <div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                Diagnose and fix.
              </h2>
              <p className="text-lg text-neutral-400">
                When a command fails because of a misconfigured environment, PawOS steps in. It investigates the broken state, identifies the missing PATH variables, applies the necessary fix, and verifies that the command now works successfully.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. JIRA INVESTIGATION */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6 tracking-wide">
                AUTONOMOUS TICKET ENGINE
              </div>
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
                From a ticket to a resolution.
              </h2>
              <p className="text-lg text-neutral-400">
                Hand PawOS a Jira ticket. It reads the requirements, gathers context from your repository, makes the necessary code changes, verifies them locally, and updates the ticket's state—connecting the external tracker directly to your local execution environment.
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl relative">
              <Image src="/pawos-companion-jira-ticket.png" alt="PawOS investigating a Jira ticket" width={1920} height={1080} className="w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 8. CROSS-CONNECTION */}
      <section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-5xl text-center mb-16 relative z-10">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            The work is connected. PawOS connects the context.
          </h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Your workflow already spans across many systems. PawOS provides a layer that understands how they relate to one another.
          </p>
        </div>
        
        <div className="mx-auto max-w-5xl mb-16">
          <ConnectionsGraphic />
        </div>

        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-neutral-800 shadow-2xl relative z-10">
          <Image src="/pawos-connections.png" alt="PawOS connections interface" width={1920} height={1080} className="w-full object-cover" />
        </div>
      </section>

      {/* 10. CURRENT / FUTURE TIMELINE */}
      <section className="py-32 px-6 bg-neutral-950 relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
              Honest about what we ship.
            </h2>
            <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
              We separate what you can use today from the architecture we are building for tomorrow.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="p-8 rounded-3xl border border-neutral-800 bg-black/40 backdrop-blur-md">
              <h3 className="text-2xl font-medium text-white mb-8 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20"></span>
                Current Capabilities
              </h3>
              <ul className="space-y-4 text-neutral-400">
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Desktop Companion & conversation</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Local File & Code Operations</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Terminal & Environment Execution</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Git workflow support</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Connected Jira, Linear, and GitHub</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Autonomous ticket resolution</li>
                <li className="flex gap-3"><span className="text-emerald-500">✓</span> Verified billing and auth foundations</li>
              </ul>
            </div>

            <div className="p-8 rounded-3xl border border-neutral-800 bg-black/40 backdrop-blur-md">
              <h3 className="text-2xl font-medium text-white mb-8 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-500/20"></span>
                Building Next
              </h3>
              <ul className="space-y-4 text-neutral-400">
                <li className="flex gap-3"><span className="text-blue-500">→</span> Full coding workspace UI & inline diffs</li>
                <li className="flex gap-3"><span className="text-blue-500">→</span> Automated browser verification</li>
                <li className="flex gap-3"><span className="text-blue-500">→</span> Direct autonomous ticket/PR creation</li>
                <li className="flex gap-3"><span className="text-blue-500">→</span> Broader actions across connected systems</li>
                <li className="flex gap-3"><span className="text-blue-500">→</span> Collaborative organizational workspaces</li>
                <li className="flex gap-3"><span className="text-blue-500">→</span> Enterprise governance & SSO</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 11. BUILDERS / STORY PREVIEW */}
      <section className="py-32 px-6 bg-black relative z-10 border-t border-neutral-900">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Built by builders.
          </h2>
          <p className="text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
            PawOS is built by people who wanted a system they could actually work with—not another assistant that only explains what you should do, but a companion that understands the relationship between the pieces of work in front of you.
          </p>
          <Link href="/about" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-medium text-lg transition-colors">
            Read our story <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      {/* 12. FINAL CTA */}
      <section className="py-32 px-6 text-center bg-neutral-950 relative z-10 border-t border-neutral-900">
        <h2 className="text-4xl md:text-6xl font-medium tracking-tight text-white mb-8">
          Your next task starts here.
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
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