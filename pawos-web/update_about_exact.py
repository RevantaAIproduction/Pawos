import sys

with open('src/app/about/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "SECTION 07 & 08" in line:
        start_idx = i
    if "SECTION 09 & 10" in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    replacement = '''            {/* SECTION 07 & 08 — ROADMAP & EVOLUTION */}
            <section>
              <h2 className="text-3xl font-medium text-white tracking-tight mb-8">Where PawOS is today, and where we are taking it.</h2>
              <div className="space-y-6 text-neutral-400">
                <p>
                  We believe in absolute honesty about what PawOS can do right now, versus what is currently in development. We don't use status tables or feature backlogs, because the evolution of PawOS isn't a checklist—it's the deepening of a new computing environment.
                </p>
                
                <div className="mt-12 space-y-12 border-l border-neutral-800 ml-4 pl-8">
                  
                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">PawOS Today</h3>
                    <p>PawOS already operates as a desktop AI companion and execution environment. It can explore codebases, make code changes, work with the terminal, install software, and fix development environment issues. These are real, shipping capabilities.</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Deepening the working environment</h3>
                    <p>We are building a richer workspace around the execution layer. This means making what PawOS is doing more visible—richer inline file viewers, clearer real diffs, persistent terminal output, and stronger visual verification.</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Expanding across connections</h3>
                    <p>Work doesn't live in one place. A task may begin in a local project, require code changes, need terminal work, interact with Git, and end with a ticket. PawOS is the execution layer moving through that work, carrying context across boundaries.</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Autonomous Work</h3>
                    <p>Autonomous ticket execution is part of PawOS today. PawOS can take supported tasks from request through execution and reporting. It operates with a strict, governed lifecycle: Request → Understand → Plan → Approve → Execute → Verify → Report.</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Organizational Direction</h3>
                    <p>This is where the genuinely future organizational expansion belongs. We are building the foundations for collaborative PawOS workspaces, granular RBAC, delegated access, enterprise SSO, and organization-wide connected workflows.</p>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-10 w-4 h-4 rounded-full bg-neutral-800 ring-4 ring-neutral-950 mt-1" />
                    <h3 className="text-lg font-medium text-white uppercase tracking-widest mb-2">Long-Term Vision</h3>
                    <p>PawOS is being built toward a computer that understands the work around you. The goal is not to replace every underlying tool. The goal is to make the tools and systems people already use work together through an intelligent execution layer.</p>
                  </div>

                </div>
              </div>
            </section>

'''
    
    new_lines = lines[:start_idx] + [replacement] + lines[end_idx:]
    with open('src/app/about/page.tsx', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Replaced lines {start_idx} to {end_idx}")
else:
    print("Could not find start/end indices")