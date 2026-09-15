import json

content = '''import React from 'react';
import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About | PawOS',
  description: 'The story of PawOS, why it exists, how it works, and where the intelligent execution environment is going.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-neutral-300 selection:bg-indigo-500/30 selection:text-white">
      {/* HEADER */}
      <header className="relative pt-40 pb-20 px-6 border-b border-neutral-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,40,90,0.15),transparent_50%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10">
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-8">
            Building a computer that understands the work around you.
          </h1>
          <p className="text-2xl text-neutral-400 font-light leading-relaxed">
            PawOS is a desktop AI companion and execution environment built to carry context across the places where real engineering work actually happens.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-24 space-y-32">

        {/* SECTION 1 — WHY PAWOS EXISTS */}
        <section id="why-it-exists" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">1. Why PawOS Exists</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              Modern technical work is fundamentally fragmented. When a software engineer, data scientist, or product builder sits down at their computer, their work rarely happens inside a single application. 
            </p>
            <p>
              A person may begin investigating a bug in their browser, move to the File Explorer, open a project, jump into a code editor, execute diagnostic commands in the terminal, check the Git state, review a GitHub pull request, cross-reference an issue in Jira or Linear, communicate with their team in Slack, deploy to an environment, and document the resolution.
            </p>
            <p>
              The problem is not that these tools are bad. These are some of the most powerful, refined applications in the world. The problem is that the <strong>WORK</strong> crosses all of them. The intent, the context, and the history of a task are scattered across ten different tabs, windows, and authenticated sessions.
            </p>
            <p>
              An AI that only answers a question in a chat box does not necessarily understand that complete workflow. If you have to manually copy terminal output, paste it into a browser, copy the AI's response, paste it back into your editor, and then manually go update a Jira ticket, you are still doing the heavy lifting of context management. 
            </p>
            <p>
              PawOS was created around a different question: <em>"What if the AI could understand the work itself and operate across the places where that work happens?"</em>
            </p>
          </div>
        </section>

        {/* SECTION 2 — MORE THAN A CHAT WINDOW */}
        <section id="more-than-chat" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">2. More Than a Chat Window</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              It is important to state what PawOS is not. PawOS is not positioned as merely "an AI chatbot," and it is not merely "a coding assistant."
            </p>
            <p>
              It is a desktop AI companion and execution environment. When a user gives PawOS a goal or a task, the system does not simply generate a block of text for the user to copy. PawOS can understand the context available to it, reason about the task, plan the supported work, request approval where required, execute the work through available runtimes and connections, and report the result back to the user.
            </p>
            <p>
              Execution is central to the product. A tool that gives you advice is an assistant; a tool that takes action on your behalf is an execution platform. PawOS is being built to take action.
            </p>
          </div>
        </section>

        {/* SECTION 3 — MORE THAN A CLI */}
        <section id="more-than-cli" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">3. More Than a CLI</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              A command-line interface (CLI) is one of the most powerful paradigms in computing. It is an incredible interface for executing commands, but it relies entirely on the user to provide the correct context and parameterization.
            </p>
            <p>
              PawOS is being built as a broader environment around the work. It brings together human interaction, project context, files, code, terminal execution, Git, connected services, autonomous work, permissions, governance, usage accounting, and execution state into a single cohesive layer.
            </p>
            <p>
              The goal is not to replace the underlying tools. PawOS does not seek to replace your code editor, your terminal emulator, or your issue tracker. The goal is to give the user an intelligent execution layer that spans across them. While PawOS does not currently control every desktop application or every external service, it acts as the connective tissue for the environments it does support.
            </p>
          </div>
        </section>

        {/* SECTION 4 — THE CROSS-CONNECTION IDEA */}
        <section id="cross-connection" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">4. The Cross-Connection Idea</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              Work doesn't live in one place. A real engineering task rarely begins and ends in a single file. 
            </p>
            <p>
              A task might begin with a Jira issue. To resolve it, PawOS may need to read the ticket, understand the local project, inspect the relevant files, analyze the code, use the terminal to run tests, make code changes, verify the result, work with Git to stage and commit, use connected GitHub context to understand pull requests, and finally report back by updating the supported ticket system.
            </p>
            <p>
              The important concept here is <strong>CONTEXT CONTINUITY</strong>.
            </p>
            <p>
              PawOS is being built as a cross-connection execution platform. We do not describe this simply as having "10 integrations." Integrations are merely the infrastructure. The important thing is what happens <em>across</em> them. The value of PawOS is its ability to maintain the state and intent of a task as it moves from a ticket, to a codebase, to a terminal, and back.
            </p>
          </div>
        </section>

        {/* SECTION 5 — CONTEXTUAL REASONING */}
        <section id="contextual-reasoning" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">5. Contextual Reasoning</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS is designed around understanding the context of the task rather than treating every message as an isolated question.
            </p>
            <p>
              When a request is made, the system uses available context to decide what work is relevant. This context can include the project structure, local files, code snippets, recent terminal state, Git status, connected tickets, available integrations, the ongoing execution state, and the overarching goal provided by the user.
            </p>
            <p>
              PawOS is being built to reason strictly from the context available to it. We do not claim unrestricted awareness of your computer, nor do we claim hidden or private context that the product does not actually possess. The reasoning engine evaluates the explicit state it is granted access to, formulates a mental model of the environment, and acts accordingly.
            </p>
          </div>
        </section>

        {/* SECTION 6 — FROM REQUEST TO EXECUTION */}
        <section id="execution-lifecycle" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">6. From Request to Execution</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none mb-12">
            <p>
              PawOS is not just generating an answer; it can take a supported task through a complete execution lifecycle. This lifecycle ensures that work is done predictably, transparently, and safely.
            </p>
          </div>
          
          <div className="bg-neutral-950 border border-neutral-900 rounded-2xl p-8 md:p-12">
            <div className="space-y-8">
              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">01</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Request</h3>
                  <p className="text-neutral-400 leading-relaxed">The user defines a goal, whether through the companion interface or by handing off a ticket from a connected service.</p>
                </div>
              </div>
              
              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">02</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Understand</h3>
                  <p className="text-neutral-400 leading-relaxed">PawOS gathers the required context, traversing directories, reading files, checking the terminal state, and pulling data from connected tools.</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">03</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Plan</h3>
                  <p className="text-neutral-400 leading-relaxed">The reasoning engine formulates a step-by-step execution plan required to fulfill the request without violating system constraints.</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-indigo-900/30 flex items-center justify-center font-mono text-sm text-indigo-400 border border-indigo-500/30">04</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Approve When Required</h3>
                  <p className="text-neutral-400 leading-relaxed">For sensitive environments, destructive actions, or high-cost operations, PawOS explicitly stops and requests human approval before proceeding.</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">05</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Execute</h3>
                  <p className="text-neutral-400 leading-relaxed">PawOS writes the code, runs the terminal commands, and manipulates the project state to implement the plan.</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">06</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Verify</h3>
                  <p className="text-neutral-400 leading-relaxed">The system observes the output of its execution—checking terminal logs, build statuses, or test suites—to ensure the change was successful.</p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 shrink-0 rounded-full bg-neutral-900 flex items-center justify-center font-mono text-sm text-neutral-500 border border-neutral-800">07</div>
                <div>
                  <h3 className="text-xl font-medium text-white mb-2">Report</h3>
                  <p className="text-neutral-400 leading-relaxed">PawOS summarizes what was changed, updating the user in the companion interface and pushing state back to connected systems like Jira or Linear.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7 — SAFE AUTONOMOUS WORKFLOWS */}
        <section id="safe-autonomous" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">7. Safe Autonomous Workflows</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              We do not present autonomy as "AI can do anything on your computer." That is an inaccurate and fundamentally unsafe concept. Instead, PawOS is designed around controlled autonomy.
            </p>
            <p>
              To perform real engineering tasks, PawOS relies on explicit execution boundaries, permissions, approval points, entitlement checks, and controlled runtimes. It maintains an auditable work state, robust cancellation and failure handling, and strict limits on connected-system actions.
            </p>
            <p>
              For supported autonomous work, the system can move from an initial ticket request, into deep investigation, through planning, execution, verification, and finally reporting. However, destructive actions—like executing arbitrary binaries, wiping directories, or modifying sensitive external infrastructure—remain strictly within appropriate approval and governance boundaries. 
            </p>
          </div>
        </section>

        {/* SECTION 8 — AUTONOMOUS TICKET RESOLUTION */}
        <section id="autonomous-tickets" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">8. Autonomous Ticket Resolution</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              One of the flagship capabilities of PawOS is autonomous ticket resolution. We believe a ticket should not just become an answer or a suggested snippet of code. 
            </p>
            <p>
              When a supported ticket is assigned, PawOS can investigate the ticket, understand the relevant project context on disk, perform the supported engineering work required to fix it, verify the result in the local environment, and report what happened.
            </p>
            <p>
              Currently, PawOS supports connected workflows with systems like Jira, Linear, and GitHub. It can read issue context, leave comments, and transition ticket statuses when work is done. It can read GitHub context and evaluate existing PR comments. We are precise about these capabilities: we do not claim PawOS currently creates new Jira tickets out of thin air, nor do we claim it creates entirely new GitHub Pull Requests, as those capabilities are bounded by our current implementation. What it does do is deeply resolve the engineering tasks it is handed.
            </p>
          </div>
        </section>

        {/* SECTION 9 — HOW PAWOS IS BUILT */}
        <section id="architecture" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">9. How PawOS is Built</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS is not just one giant AI model. It is an architecture of multiple cooperating layers designed to move safely from conversation to execution.
            </p>
            <ul className="space-y-4">
              <li>
                <strong className="text-white">1. Companion / Interaction Layer:</strong> The human-facing surface that handles intent parsing, conversational state, progress reporting, and user approvals.
              </li>
              <li>
                <strong className="text-white">2. Context + Reasoning Layer:</strong> The intelligence engine that retrieves local files, evaluates terminal outputs, queries connected services, and builds the execution plan.
              </li>
              <li>
                <strong className="text-white">3. Runtime / Execution Layer:</strong> The isolated environment that actually applies diffs, executes terminal commands, interfaces with Git, and verifies output.
              </li>
              <li>
                <strong className="text-white">4. Connections + Governance Layer:</strong> The security and API layer managing external tool authentication, RBAC, usage accounting, and billing boundaries.
              </li>
            </ul>
          </div>
        </section>

        {/* SECTION 10 — THE COMPANION */}
        <section id="companion" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">10. The Companion</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              The PawOS Companion is not merely a mascot. It is the human-facing presence of the operating system. 
            </p>
            <p>
              The Companion provides the interaction layer through which the user gives goals, receives continuous progress updates, approves sensitive work, and sees final results. It is the anchor point on the desktop, ensuring that even when PawOS is running deep autonomous terminal tasks in the background, the user always has a clear, understandable visual representation of what is happening.
            </p>
            <p>
              While we are actively exploring deeper interactivity, we do not currently claim full conversational voice or advanced 3D spatial capabilities as shipped features. The Companion today is a focused, highly functional window into the execution engine.
            </p>
          </div>
        </section>

        {/* SECTION 11 — CONNECTIONS */}
        <section id="connections" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">11. Connections</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              The broader connection model is what allows PawOS to perform cross-connection execution. Currently, PawOS can work with supported systems such as local Files, Projects, Code, Terminal, Git, GitHub, Jira, Linear, Slack, and the Browser.
            </p>
            <p>
              It is important to distinguish between an available connection, a supported action, and future deeper actions. Not all of these systems currently have identical levels of automation. For instance, PawOS can deeply modify local files and terminal state, while its interaction with Slack might be limited to status reporting. The core story remains constant: carrying context and execution across these boundaries to get the work done.
            </p>
          </div>
        </section>

        {/* SECTION 12 — BILLING, PERMISSIONS AND CONTROL */}
        <section id="governance" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">12. Billing, Permissions, and Control</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              Because PawOS is designed to perform real work on real systems, execution requires control. Governance exists to ensure that trust is maintained at every level of the stack.
            </p>
            <p>
              At a high level, the PawOS architecture includes strict user authentication, capability entitlements, execution permissions, and explicit approval boundaries for sensitive actions. It also includes rigorous usage accounting, accounting for autonomous background work separately from normal interaction compute. 
            </p>
            <p>
              We do not over-market billing as a feature; rather, we emphasize that a system capable of autonomously investigating codebases and modifying state must have robust, enterprise-grade accounting and control foundations from day one.
            </p>
          </div>
        </section>

        {/* SECTION 13 — WHAT PAWOS IS TODAY */}
        <section id="today" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">13. Where PawOS is today — and where we're taking it</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS already works across desktop, project, and engineering workflows. We do not use SaaS comparison tables or feature backlogs with green "Available" dots and blue "Coming Soon" dots, because PawOS is a living environment, not a static feature list.
            </p>
            <p>
              Today, current meaningful capabilities include the desktop companion, deep project and file understanding, direct code changes, terminal and environment execution, software installation tasks, development environment and path fixes, Git and project work, supported Jira and Linear workflows, GitHub context analysis, autonomous ticket execution, and the core governance and billing foundations required to run it safely.
            </p>
          </div>
        </section>

        {/* SECTION 14 — WHAT WE ARE DEEPENING */}
        <section id="deepening" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">14. What We Are Deepening</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              We are not building toward a point where "PawOS becomes a coding workspace"—that is incorrect, because PawOS already performs engineering work today. 
            </p>
            <p>
              Instead, we are <em>deepening the working environment</em>. These are improvements around our already existing execution system. We are building richer inline code and file viewers, clearer visual diffs, stronger persistent work visibility, richer terminal output, deeper project context, stronger visual verification tools, deeper isolated autonomous workspaces, and broader cross-runtime execution. 
            </p>
          </div>
        </section>

        {/* SECTION 15 — ORGANIZATIONAL PAWOS */}
        <section id="organizational" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">15. Organizational PawOS</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              While PawOS is incredibly powerful for individual developers, the future direction involves an organizational layer. 
            </p>
            <p>
              This future expansion includes collaborative workspaces, richer organization-wide context, Role-Based Access Control (RBAC), delegated access, approval policies, enterprise governance, budgets, enterprise administration, and SSO. We clearly distinguish this future enterprise expansion from the individual capabilities that are shipping today.
            </p>
          </div>
        </section>

        {/* SECTION 16 — THE LONG-TERM IDEA */}
        <section id="long-term" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">16. The Long-Term Idea</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS is being built toward a computer that understands the work around you. 
            </p>
            <p>
              We view the future of work as a continuous connection between people, projects, files, software, tools, execution, communication, and organizations. The goal is not to replace every underlying tool you use. The goal is to create an intelligent execution layer that understands how all those pieces relate to the work being done, removing the friction of context-switching forever.
            </p>
          </div>
        </section>

        {/* SECTION 17 — WHY WE ARE BUILDING THIS */}
        <section id="why-building" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">17. Why We Are Building This</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              AI is rapidly becoming capable of reasoning and generating code, but real work is much harder than generating a Python script in a vacuum. Real work requires navigating context, fragile local environments, specialized tools, fragmented systems, strict permissions, rigorous verification, and relentless follow-through.
            </p>
            <p>
              We built PawOS because someone needed to bridge the gap between "AI that talks" and "AI that does." We wanted a system that could actually carry the burden of execution across the messy reality of a modern developer's desktop.
            </p>
          </div>
        </section>

        {/* SECTION 18 — THE BUILDERS */}
        <section id="builders" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">18. Built by Builders</h2>
          <div className="flex flex-col md:flex-row gap-12 items-start mt-8">
            <div className="w-full md:w-1/3 shrink-0">
              <div className="aspect-square rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 relative">
                <Image src="/founder.jpg" alt="PawOS Founder" fill className="object-cover" />
              </div>
            </div>
            <div className="w-full md:w-2/3 prose prose-invert prose-lg text-neutral-400 leading-relaxed">
              <p>
                PawOS was started by a builder deeply frustrated by the limitations of conversational AI in real-world engineering. 
              </p>
              <p>
                The engineering philosophy behind PawOS is simple: execution matters, and honesty matters. We do not invent fake corporate leadership teams, we do not fabricate usage statistics, and we do not advertise future architecture as shipped capabilities. We are building this because we need it to exist, and we are sharing it because we believe execution-focused AI is the next computing paradigm.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 19 — RESEARCH + ENGINEERING PHILOSOPHY */}
        <section id="research" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">19. Research & Engineering Philosophy</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              The product is driven by an intense research and engineering focus around contextual reasoning, reliable execution, agent runtimes, safe autonomy, cross-connection workflows, governance, human approval, and verification. 
            </p>
            <p>
              We focus our research on practical, safe, and verifiable intelligence rather than theoretical claims. Our engineering mandate is to ensure that every autonomous action is bounded by transparent rules, resulting in a product that professionals can actually trust.
            </p>
          </div>
        </section>

        {/* SECTION 20 — ROADMAP */}
        <section id="roadmap" className="scroll-mt-32">
          <h2 className="text-3xl font-medium text-white mb-12 tracking-tight">20. Product Evolution</h2>
          <div className="space-y-16 border-l border-neutral-800 ml-4 pl-8">
            
            <div className="relative">
              <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
              <h3 className="text-sm font-mono text-indigo-400 tracking-widest mb-2">01</h3>
              <h4 className="text-xl font-medium text-white mb-3">Work with the computer</h4>
              <p className="text-neutral-400 leading-relaxed">PawOS already works with projects, files, code, terminal, environments, and development workflows.</p>
            </div>

            <div className="relative">
              <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
              <h3 className="text-sm font-mono text-indigo-400 tracking-widest mb-2">02</h3>
              <h4 className="text-xl font-medium text-white mb-3">Work across connections</h4>
              <p className="text-neutral-400 leading-relaxed">PawOS carries context across supported systems such as Git, GitHub, Jira, Linear, Slack, and other connected environments.</p>
            </div>

            <div className="relative">
              <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
              <h3 className="text-sm font-mono text-indigo-400 tracking-widest mb-2">03</h3>
              <h4 className="text-xl font-medium text-white mb-3">Deepen autonomous work</h4>
              <p className="text-neutral-400 leading-relaxed">Expand the execution environment, verification, isolation, visibility, and breadth of autonomous work.</p>
            </div>

            <div className="relative">
              <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
              <h3 className="text-sm font-mono text-indigo-400 tracking-widest mb-2">04</h3>
              <h4 className="text-xl font-medium text-white mb-3">Organizational PawOS</h4>
              <p className="text-neutral-400 leading-relaxed">Expand into collaborative workspaces, delegated access, RBAC, governance, approval policies, budgets, and enterprise administration.</p>
            </div>

            <div className="relative">
              <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
              <h3 className="text-sm font-mono text-indigo-400 tracking-widest mb-2">05</h3>
              <h4 className="text-xl font-medium text-white mb-3">The broader work environment</h4>
              <p className="text-neutral-400 leading-relaxed">A computer and work environment that understands the work happening around people, projects, software, tools, and organizations.</p>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}
'''

with open('src/app/about/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Rewrote About page completely.")