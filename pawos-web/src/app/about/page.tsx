import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About PawOS",
  description: "The engineering problem PawOS is built to address and the principles behind its development.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#080a0d] text-white">
      <header className="border-b border-white/10 px-6 pb-20 pt-32 sm:pt-40">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">About PawOS</p>
          <h1 className="mt-6 max-w-5xl text-5xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-6xl lg:text-7xl">Engineering work does not stop at the code editor.</h1>
          <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-300 sm:text-xl">PawOS is being built to help developers coordinate the work around a software change: understanding a project, investigating a task, planning edits, running supported tools and reviewing the result.</p>
        </div>
      </header>
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">The problem</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">A software task crosses many steps.</h2>
          </div>
          <div className="space-y-6 text-base leading-8 text-neutral-400">
            <p>A developer may begin with a bug report, then inspect a codebase, reproduce an error, trace dependencies, edit files, run commands and verify the result. The work is connected, but the tools and context are often spread across different places.</p>
            <p>AI development tools can help with parts of this process. PawOS focuses on coordinating supported engineering steps around a goal, while keeping product capabilities, permissions and execution boundaries explicit.</p>
            <p>That means PawOS should be judged by the work it can actually perform and the evidence it can show — not by broad claims about autonomy.</p>
          </div>
        </div>
      </section>
      <section className="border-y border-white/10 bg-[#0c0f14] px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Product principles</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Clear execution boundaries", "Web, CLI and Desktop work in different environments and do not share every capability."],
              ["Review before consequential actions", "Approval requirements depend on the action, product experience and account settings."],
              ["Evidence over assumptions", "A tool call is not proof of a successful outcome. Checks and limitations should be reported clearly."],
            ].map(([title, body]) => <article key={title} className="rounded-xl border border-white/10 bg-[#080a0d] p-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p></article>)}
          </div>
        </div>
      </section>
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-tight">Explore the product.</h2>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/" className="rounded-lg border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/5">Product overview</Link>
            <Link href="/docs" className="rounded-lg border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/5">Developer documentation</Link>
            <Link href="/security" className="rounded-lg border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/5">Security and permissions</Link>
            <Link href="/support/contact" className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-200">Contact the team</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
