import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''      {/* 10. PRODUCT EVOLUTION (01 - 05) */}
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

      {/* 11. BUILDERS / STORY PREVIEW */}'''

pattern = r"      \{\/\* 10\. PRODUCT EVOLUTION \(01 \- 05\) \*\/\}.*?\{\/\* 11\. BUILDERS \/ STORY PREVIEW \*\/\}"
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replaced content successfully.")