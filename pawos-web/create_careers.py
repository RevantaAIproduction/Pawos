import os

os.makedirs('src/app/careers', exist_ok=True)

content = '''import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Careers | PawOS',
  description: 'Build what comes next. Engineering and product roles at Revanta AI.',
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-black text-neutral-300 selection:bg-indigo-500/30 selection:text-white">
      {/* HERO */}
      <header className="relative pt-40 pb-32 px-6 border-b border-neutral-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,40,90,0.15),transparent_50%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white mb-8">
            Build what comes next.
          </h1>
          <p className="text-2xl text-neutral-400 font-light leading-relaxed max-w-3xl mx-auto">
            Revanta AI is building PawOS as a new kind of AI work environment—one that can understand work, operate across connected systems, execute real tasks, and eventually become a broader environment for individuals, teams, and organizations.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-32 space-y-32">
        
        {/* THE BUILDERS WE CARE ABOUT */}
        <section>
          <h2 className="text-3xl font-medium text-white mb-10 tracking-tight">The engineering ahead of us</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none mb-12">
            <p>
              To make an intelligent execution environment a reality, we need builders who can bridge the gap between applied AI and deep systems engineering. We care deeply about the following domains:
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
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Build from first principles</h3>
              <p className="text-neutral-400 leading-relaxed">
                We are building a new paradigm for how humans and computers interact. We want builders who can break down complex problems to their core truths rather than relying on how things have always been done.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Care about the system, not just the interface</h3>
              <p className="text-neutral-400 leading-relaxed">
                A beautiful chat window means nothing if the underlying execution engine fails. We value deep architectural thinking that ensures resilience across the entire stack.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Make ambitious ideas actually work</h3>
              <p className="text-neutral-400 leading-relaxed">
                Autonomous AI workflows are incredibly difficult to make reliable. We look for engineers who are relentless about taking a visionary concept and turning it into something that works 99.9% of the time.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Prefer useful execution over impressive demos</h3>
              <p className="text-neutral-400 leading-relaxed">
                Anyone can build a fragile demo. We are building a product for professional engineers and knowledge workers. It must provide genuine utility and withstand the chaos of real-world environments.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Treat safety as a product requirement</h3>
              <p className="text-neutral-400 leading-relaxed">
                Giving an AI access to a local development environment is a massive responsibility. User control, permission boundaries, and verifiable execution are not afterthoughts—they are the product.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-medium text-indigo-300 mb-3">Be honest about what is shipped</h3>
              <p className="text-neutral-400 leading-relaxed">
                We do not sell vaporware or advertise future capabilities as current features. We want people who share a commitment to transparency and engineering integrity.
              </p>
            </div>

          </div>
        </section>

        {/* THE BUILDER STORY */}
        <section>
          <h2 className="text-3xl font-medium text-white mb-8 tracking-tight">The Builder Story</h2>
          <div className="prose prose-invert prose-lg text-neutral-400 leading-relaxed max-w-none">
            <p>
              PawOS is being built by people who believe AI should move beyond answering questions and become capable of understanding context, planning work, executing through controlled runtimes, and operating across the complex systems involved in getting work done.
            </p>
            <p>
              We are not just building another coding assistant. We are researching and engineering a cross-connection platform that bridges the gap between intent and execution. If you believe that the future of computing requires a layer of intelligent orchestration, you belong here.
            </p>
          </div>
        </section>

        {/* CURRENT OPENINGS / APPLY */}
        <section className="bg-neutral-900/30 border border-neutral-800 rounded-2xl p-10 md:p-16 text-center">
          <h2 className="text-3xl font-medium text-white mb-6 tracking-tight">Current Openings</h2>
          <p className="text-xl text-neutral-400 font-light leading-relaxed max-w-2xl mx-auto mb-12">
            We don't have a public list of open roles right now. We're building carefully, and the right opportunity may not always fit a predefined job description.
          </p>
          
          <div className="border-t border-neutral-800 pt-12">
            <h3 className="text-2xl font-medium text-white mb-4">Think you should build with us?</h3>
            <p className="text-neutral-400 mb-8">
              If you align with our engineering philosophy and want to help build PawOS, we would love to hear from you.
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
'''

with open('src/app/careers/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Created /careers/page.tsx")