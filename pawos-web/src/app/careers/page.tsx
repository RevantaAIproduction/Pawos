import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Careers | PawOS',
  description: 'Learn about engineering and product work at Revanta AI. No public roles are listed at this time.',
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-black text-neutral-300 selection:bg-indigo-500/30 selection:text-white">
      {/* HERO */}
      <header className="relative pt-40 pb-32 px-6 border-b border-neutral-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,40,90,0.15),transparent_50%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-8">
            Help build PawOS.
          </h1>
          <p className="text-2xl text-neutral-400 font-light leading-relaxed max-w-3xl mx-auto">
            Revanta AI is building PawOS, an AI development operating system for engineering work. The product spans a Windows desktop app, a local-project CLI and browser-based Web workflows.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-32 space-y-32">
        
        {/* THE BUILDERS WE CARE ABOUT */}
        <section>
          <h2 className="text-3xl font-medium text-white mb-10 tracking-tight">The engineering ahead of us</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none mb-12">
            <p>
              PawOS brings together AI, local software execution and developer workflows. The work spans:
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              "AI & Agent Systems",
              "Software Engineering",
              "Desktop & Runtime Engineering",
              "Frontend & Interaction Engineering",
              "Infrastructure & Security",
              "Integrations & Tooling",
              "Product Design",
              "Developer Experience",
              "Research & Applied AI"
            ].map(domain => (
              <div key={domain} className="bg-neutral-950 border border-neutral-900 rounded-xl p-6">
                <div className="text-lg font-medium text-neutral-200">{domain}</div>
              </div>
            ))}
          </div>
        </section>

        {/* WHAT WE LOOK FOR */}
        <section>
          <h2 className="text-3xl font-medium text-white mb-10 tracking-tight">What we look for</h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-12">
            
            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Understand the problem before choosing a solution</h3>
              <p className="text-neutral-400 leading-relaxed">
                We value people who can make a complicated problem concrete, test their assumptions and explain the tradeoffs behind a design.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Care about the whole system</h3>
              <p className="text-neutral-400 leading-relaxed">
                PawOS connects interfaces to runtimes and external services. We care about the behavior between those pieces as much as the interface itself.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Make difficult workflows dependable</h3>
              <p className="text-neutral-400 leading-relaxed">
                Engineering tasks can fail for ordinary reasons: missing tools, permissions or unexpected project state. We want to make those limits visible and handle failures carefully.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Prefer useful execution over impressive demos</h3>
              <p className="text-neutral-400 leading-relaxed">
                We prefer improvements people can use in real projects over demos that hide setup requirements or failure cases.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Treat safety as a product requirement</h3>
              <p className="text-neutral-400 leading-relaxed">
                Local project access and connected accounts require care. Permissions, approvals and clear reporting are part of the product design.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Be honest about what is shipped</h3>
              <p className="text-neutral-400 leading-relaxed">
                We distinguish shipped behavior from work in progress and describe failures as clearly as successful runs.
              </p>
            </div>

          </div>
        </section>

        {/* THE BUILDER STORY */}
        <section>
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">What we are building</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS is designed to help with engineering tasks that involve more than producing code suggestions. Depending on the experience, it can work in a local project or a connected GitHub repository, while respecting the access available there.
            </p>
            <p>
              We are working on the practical details: understanding a project, planning a change, carrying out supported steps and reporting what could be checked. If that work interests you, tell us what you would bring to the team.
            </p>
          </div>
        </section>

        {/* CURRENT OPENINGS / APPLY */}
        <section className="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-10 md:p-16 text-center">
          <h2 className="text-3xl font-medium text-white mb-6 tracking-tight">Current Openings</h2>
          <p className="text-xl text-neutral-400 font-light leading-relaxed max-w-2xl mx-auto mb-12">
            There are no public openings at the moment. You can still introduce yourself and tell us which part of the product you would like to work on.
          </p>
          
          <div className="border-t border-neutral-800 pt-12">
            <h3 className="text-2xl font-medium text-white mb-4">Think you should build with us?</h3>
            <p className="text-neutral-400 mb-8">
              If you are interested in working on PawOS, send the team a note.
            </p>
            <a 
              href="mailto:hello@revantaai.com?subject=Careers%20at%20Revanta%20AI" 
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors"
            >
              Reach out to our team &rarr;
            </a>
          </div>
        </section>

      </main>
    </div>
  );
}
