const fs = require('fs');

const aboutContent = import type { Metadata } from "next";
import Image from "next/image";
import { Button } from "../../components/ui/Button";

export const metadata: Metadata = {
  title: "The Story of PawOS",
  description: "A desktop AI system built around the work you actually need to get done.",
};

export default function AboutPage() {
  return (
    <div className="pt-32 pb-32">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        {/* HERO */}
        <div className="mb-32">
          <p className="text-sm font-semibold tracking-widest text-indigo-400 uppercase mb-4">THE STORY OF PAWOS</p>
          <h1 className="text-5xl font-medium tracking-tight text-white sm:text-7xl mb-8">
            Why PawOS exists
          </h1>
          <p className="text-2xl text-neutral-400 font-light leading-relaxed max-w-3xl">
            A desktop AI system built around the work you actually need to get done.
          </p>
        </div>

        <div className="prose prose-invert prose-lg prose-neutral max-w-none space-y-24">

          {/* SECTION 01 — THE PROBLEM */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Work is scattered across everything.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                Modern software work is fragmented. When a developer sits down to accomplish a task, the actual work rarely happens in a single location.
              </p>
              <p>
                A single request can span across the file explorer to find the right directory, a code editor to make the changes, a terminal to run tests, a Git client to commit the results, GitHub to open a pull request, Jira or Linear to track the ticket, and Slack to communicate with the team. 
              </p>
              <p>
                Each of these systems understands only part of the work. A coding assistant can write code. A terminal can execute commands. Git can track changes. Jira can track tickets. But you are still responsible for moving the context between all of them.
              </p>
              <p>
                PawOS was created around the idea that the AI should be able to operate across the work context rather than forcing you to continuously translate between tools. The computer should understand the relationship between the pieces of the puzzle.
              </p>
            </div>
          </section>

          {/* SECTION 02 — WHY PAWOS */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">We wanted the computer to understand the work, not just the question.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                AI interfaces are incredibly good at answering questions. But answering questions is only the beginning of a workflow. If an AI gives you a perfect explanation of how to fix a bug, the actual work is still entirely on your shoulders. You must find the files, apply the fix, test it, commit it, and resolve the ticket.
              </p>
              <p>
                We wanted a system we could actually work with—an AI companion that doesn't just explain what to do, but understands the environment where the work is happening.
              </p>
              <p>
                PawOS combines AI reasoning with local execution, project context, engineering tools, external connections, autonomous work, and explicit governance. The desktop companion is the human-facing presence of this much larger system.
              </p>
            </div>
          </section>

          {/* SECTION 03 — FROM COMPANION TO SYSTEM */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">It started with a companion. It became a system.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                The earliest versions of PawOS focused heavily on conversation and context. We wanted a persistent desktop presence that could follow along as you worked.
              </p>
              <p>
                But conversation naturally evolved into action. A companion that understands your files should be able to edit them. A companion that edits your files should be able to test them in the terminal. A companion that runs tests should be able to read the connected Jira ticket that requested the change in the first place.
              </p>
              <p>
                This evolution turned PawOS from a chatbot into a cohesive work platform. Conversation led to context. Context led to projects, files, and terminal execution. That expanded to Git, browser verification, and external services. Which finally culminated in autonomous execution and organizational workflows. 
              </p>
              <p className="text-xl text-white font-medium mt-10">
                One workflow, across many systems.
              </p>
            </div>
          </section>

          {/* SECTION 04 — WHAT PAWOS IS */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">PawOS is the layer between you and the work.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                PawOS is designed to make disparate pieces of technology participate in a single, coherent workflow.
              </p>
              <p>
                A standard PawOS workflow can involve AI reasoning, project context gathering, deep repository analysis, code editing, terminal execution, builds, tests, Git operations, and external ticket management—all orchestrated safely. 
              </p>
              <p>
                Instead of switching between ten applications and holding the state of the task in your head, PawOS acts as the connecting layer. It is one system designed to follow the task from conception to completion.
              </p>
            </div>
          </section>

          {/* SECTION 05 — HOW PAWOS IS BUILT */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Built as layers, not a single agent.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                PawOS is fundamentally organized into four major architectural layers.
              </p>
              <div className="grid gap-8 mt-12">
                <div className="rounded-2xl border border-neutral-800 p-8 bg-neutral-900/20">
                  <h3 className="text-xl font-semibold text-white mb-4">Layer 1: AI / Model Layer</h3>
                  <p>Handles core reasoning, context processing, code generation, analysis, and visual/voice interaction capabilities where supported.</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 p-8 bg-neutral-900/20">
                  <h3 className="text-xl font-semibold text-white mb-4">Layer 2: Engineering Runtime</h3>
                  <p>The local execution environment. Manages file operations, terminal sessions, Git, builds, tests, repository context, and worktrees.</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 p-8 bg-neutral-900/20">
                  <h3 className="text-xl font-semibold text-white mb-4">Layer 3: Autonomous Ticket Engine</h3>
                  <p>Connects external systems like Jira, Linear, and GitHub. Manages the autonomous execution queue, persistence, validation, and external ticket updates.</p>
                </div>
                <div className="rounded-2xl border border-neutral-800 p-8 bg-neutral-900/20">
                  <h3 className="text-xl font-semibold text-white mb-4">Layer 4: Organizational Control Plane</h3>
                  <p>The governance layer. Manages organizations, teams, permissions, connector credentials, approval policies, budgets, and billing.</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 06 — THE WORKFLOW */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">From a request to real work.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                When you hand a task to PawOS, it does not blindly begin generating code. The architecture enforces a strict, verifiable lifecycle.
              </p>
              <div className="flex flex-col md:flex-row items-center justify-between text-sm font-mono text-indigo-300 bg-black/40 border border-neutral-800 rounded-xl p-6 my-10 overflow-x-auto gap-4">
                <span>REQUEST</span> <span>→</span>
                <span>UNDERSTAND</span> <span>→</span>
                <span>CONTEXT</span> <span>→</span>
                <span>PLAN</span> <span>→</span>
                <span>APPROVE</span> <span>→</span>
                <span>EXECUTE</span> <span>→</span>
                <span>VALIDATE</span> <span>→</span>
                <span>REPORT</span>
              </div>
              <p>
                For autonomous ticket work, the flow is even more rigorous. PawOS reads the ticket, gathers context from the repository, provisions an isolated workspace, formulates a plan, asks for execution permissions, executes the changes, validates them with evidence, and updates the external ticket upon completion. The orchestrator—not just the AI model—enforces these critical safety boundaries.
              </p>
            </div>
          </section>

          {/* SECTION 07 & 08 — WHAT PAWOS CAN DO TODAY / HONESTY */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">What is shipping, and what is still being built.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                We believe in absolute honesty about what PawOS can do right now, versus what is currently in development. We never advertise future architecture as a shipped feature.
              </p>
              
              <div className="space-y-12 mt-12">
                <div>
                  <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300 mb-6">
                    AVAILABLE NOW
                  </div>
                  <ul className="list-disc pl-6 space-y-4">
                    <li><strong className="text-white">Desktop Companion:</strong> A persistent companion presence with conversational interaction.</li>
                    <li><strong className="text-white">Engineering Work:</strong> File exploration, deep repository context gathering, code analysis, code editing, terminal execution, and Git workflows.</li>
                    <li><strong className="text-white">Connected Work:</strong> Jira (Read, Comment, Done), Linear (Read, Comment, Done), and GitHub (Read, existing PR comments).</li>
                    <li><strong className="text-white">Autonomous Work:</strong> The autonomous ticket resolution engine, capable of taking a supported issue from context to completion.</li>
                    <li><strong className="text-white">Control:</strong> Core billing foundations, entitlements, user authentication, and critical approval boundaries for destructive actions.</li>
                  </ul>
                </div>

                <div>
                  <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-300 mb-6">
                    PARTIALLY BUILT / VERIFYING
                  </div>
                  <ul className="list-disc pl-6 space-y-4">
                    <li><strong className="text-white">Browser Verification:</strong> Foundations exist for automated visual verification, expanding to full browser automation in a future phase.</li>
                    <li><strong className="text-white">Voice & 3D Presence:</strong> Active architectural capabilities that are continually being refined for deeper interactivity.</li>
                  </ul>
                </div>

                <div>
                  <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6">
                    FUTURE / PLANNED
                  </div>
                  <ul className="list-disc pl-6 space-y-4">
                    <li><strong className="text-white">Coding Workspace:</strong> A dedicated, rich UI surface with inline file search, real before/after diffs, and persistent terminal output.</li>
                    <li><strong className="text-white">Deeper External Actions:</strong> Direct creation of Jira tickets and GitHub Pull Requests directly via autonomous orchestration.</li>
                    <li><strong className="text-white">Enterprise Organizations:</strong> Fully collaborative organizational workspaces with SSO, SCIM, and team-based role access control (RBAC).</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 09 & 10 — MORE THAN A CLI & CROSS-CONNECTION */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Everything around the work, connected.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                PawOS is significantly more than a CLI. A CLI is a powerful interface for executing commands, but it relies entirely on the user to provide the correct context. 
              </p>
              <p>
                PawOS connects the context. It merges your user intent with desktop context, project structures, source code, terminal commands, Git history, external issue trackers, and rigorous verification. 
              </p>
              <div className="my-16 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
                <Image src="/pawos-connections.png" alt="PawOS connections demonstrating connected developer services" width={1920} height={1080} className="w-full object-cover" />
              </div>
              <p>
                This isn't just an integrations grid. The goal is to connect the systems that participate in the exact same piece of work, so a Jira ticket natively informs a terminal test, which natively informs a Git commit, which natively updates the ticket.
              </p>
            </div>
          </section>

          {/* SECTION 11 & 12 — AUTONOMOUS TICKET RESOLUTION & SAFETY */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Power with control.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                The work should not stop at "here is the code." A ticket has requirements, repository context, implementation steps, validation, evidence, and communication. PawOS's goal is to carry the task through that entire workflow locally on your machine.
              </p>
              <p>
                But real work requires real boundaries. PawOS is designed to operate safely. Execution states, workspace isolation, billing authorization, and explicit approval policies ensure you stay in control. PawOS will not silently perform destructive actions or deploy to production without explicit human authorization.
              </p>
            </div>
          </section>

          {/* SECTION 13 & 14 — HOW WE BUILD / BUILDERS */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Built around the work, not around a demo.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                Our engineering philosophy is simple: Verify before claiming. Preserve working architecture. Build incrementally. Keep billing and permissions explicit. Prefer concrete evidence over flashy UI promises.
              </p>
              <div className="mt-12 p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col md:flex-row gap-8 items-start">
                <div className="w-32 h-32 shrink-0 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center border border-neutral-700">
                  <span className="text-neutral-500 font-medium">Revanta AI</span>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-white">Built by people who wanted this themselves.</h3>
                  <p className="text-sm font-medium text-indigo-400 mb-4 mt-2">Founder / Builder, Revanta AI</p>
                  <p className="text-neutral-400 leading-relaxed">
                    "I wanted a system I could actually work with, not another assistant that only explains what I should do. The goal is to make AI useful across the actual computer workflow. Not only generating code, and not only executing commands, but genuinely understanding the relationship between the pieces of work in front of you."
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 15 & 16 & 17 — THE RESEARCH IDEA & ROADMAP */}
          <section>
            <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Where PawOS goes next.</h2>
            <div className="space-y-6 text-neutral-400">
              <p>
                PawOS orchestrates existing AI models behind a unified product and runtime layer, pushing the boundaries of contextual reasoning, safe autonomous workflows, and organization governance.
              </p>
              <div className="mt-12 space-y-12 border-l border-neutral-800 ml-4 pl-8">
                
                <div className="relative">
                  <div className="absolute -left-10 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-neutral-950 mt-1" />
                  <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Now</h3>
                  <p>PawOS desktop companion, engineering work, terminal integration, Git, selected integrations (Jira, Linear, GitHub), and autonomous ticket work.</p>
                </div>

                <div className="relative">
                  <div className="absolute -left-10 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-neutral-950 mt-1" />
                  <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Next</h3>
                  <p>Phase 1 & 2: A stronger Coding Workspace (inline viewers, real diffs, persistent terminal logs). Deeper autonomous engineering with isolated workspaces and visual verification.</p>
                </div>

                <div className="relative">
                  <div className="absolute -left-10 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-neutral-950 mt-1" />
                  <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Later</h3>
                  <p>Phase 3 & 4: Organizational PawOS. Teams, RBAC, approval policies, budgets, and enterprise SSO, combined with deeper cross-runtime capabilities spanning browsers and productivity tools.</p>
                </div>

                <div className="relative">
                  <div className="absolute -left-10 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-neutral-950 mt-1" />
                  <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Long Term</h3>
                  <p>A computer that understands the work around you. Connecting people, projects, software, execution, and organizations without replacing every underlying tool you already use.</p>
                </div>

              </div>
            </div>
          </section>

          {/* SECTION 18 — FINAL HUMAN SECTION */}
          <section className="text-center pt-24 pb-12 border-t border-neutral-900 mt-32">
            <h2 className="text-4xl font-medium tracking-tight text-white sm:text-5xl mb-6">
              We are still building it.
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-neutral-400 mb-12">
              PawOS is an evolving product. Some systems are mature. Some are being verified. Some are intentionally future work. We are building a system that becomes genuinely useful as each layer becomes real.
            </p>
            <div className="flex justify-center gap-4">
              <Button href="/download" className="px-8 py-4 text-base font-medium bg-white text-black hover:bg-neutral-200">
                Download for Windows &rarr;
              </Button>
              <Button href="/docs" variant="secondary" className="px-8 py-4 text-base font-medium bg-transparent text-white border border-neutral-700 hover:bg-neutral-900">
                Explore the documentation
              </Button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
;

fs.writeFileSync('src/app/about/page.tsx', aboutContent);
console.log('About page created.');