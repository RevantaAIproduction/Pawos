import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About PawOS",
  description: "Why PawOS exists, how it approaches engineering work, and what it is being built to do.",
};

export default function AboutPage() {
  return (
    <div className="bg-black text-white">
      <header className="border-b border-neutral-900 px-6 pb-20 pt-32 md:pb-28 md:pt-40">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">About PawOS</p>
          <h1 className="mt-6 max-w-5xl text-5xl font-medium leading-[1.04] tracking-[-0.045em] sm:text-6xl md:text-7xl">
            Tools for engineering work that has to get done.
          </h1>
          <p className="mt-8 max-w-3xl text-xl leading-relaxed text-neutral-400 md:text-2xl">
            PawOS is an AI Development Operating System for planning and carrying out supported engineering tasks across Desktop, CLI and Web.
          </p>
        </div>
      </header>

      <section className="border-b border-neutral-900 px-6 py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">Why PawOS exists</p>
            <h2 className="mt-4 text-3xl font-medium tracking-tight md:text-5xl">A code change rarely starts and ends in one place.</h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-neutral-400">
              <p>Understanding a project, changing code, running it and reporting the result can involve a folder, terminal, GitHub and an issue tracker.</p>
              <p>PawOS helps with supported steps in that process. What it can do depends on the experience, connected services and permissions in use.</p>
            </div>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
            <Image src="/pawos-desktop-capture.png" alt="PawOS Desktop workspace showing a task prompt and the companion interface" width={1000} height={764} sizes="(min-width: 1024px) 50vw, 100vw" className="block h-auto w-full object-contain" />
            <figcaption className="border-t border-neutral-800 px-4 py-3 text-sm text-neutral-400">An authentic PawOS Desktop capture.</figcaption>
          </figure>
        </div>
      </section>

      <section className="border-b border-neutral-900 bg-neutral-950 px-6 py-20 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">Our approach</p>
            <h2 className="mt-4 text-3xl font-medium tracking-tight md:text-5xl">People should be able to follow the work.</h2>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-neutral-400">
            <p>PawOS can use the context available to it to prepare a plan and carry out supported work. Some actions require approval before they run.</p>
            <p>Desktop works with the local Windows environment. CLI works in the local folder where it is started. Web supports browser-based chat and connected repository workflows; it does not access files on your computer.</p>
            <p>After execution, PawOS reports what it did and what it could verify. The exact actions available depend on the product experience, connected services and granted access.</p>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-900 px-6 py-20 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">What we are building</p>
            <h2 className="mt-4 text-3xl font-medium tracking-tight md:text-5xl">More continuity across the work.</h2>
          </div>
          <div className="space-y-5 text-lg leading-relaxed text-neutral-400">
            <p>Desktop runs on Windows, CLI works in the local folder where it is started, and Web supports browser chat and GitHub-connected repository changes.</p>
            <p>We are working to make it easier to carry context between the steps of an engineering task. Each integration will remain limited to the actions it actually supports.</p>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 text-center md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-medium tracking-tight md:text-5xl">See what PawOS can do today.</h2>
          <p className="mt-5 text-lg leading-relaxed text-neutral-400">Compare the product experiences, read the guides, or contact the team.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/features" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200">Explore Product</Link>
            <Link href="/support/contact" className="rounded-full border border-neutral-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900">Contact PawOS</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
