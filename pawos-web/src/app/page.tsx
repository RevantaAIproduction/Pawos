import Link from "next/link";

const BEFORE_AFTER = [
  {
    title: "Without a companion",
    body: "You juggle a dozen open windows, re-explain context every time you switch tasks, and nothing remembers what you were doing yesterday.",
  },
  {
    title: "With Paw",
    body: "One companion lives on your desktop, aware of what you're working on, remembers your projects and preferences, and can act on your behalf when you ask.",
  },
];

const FEATURES = [
  {
    title: "Coding Canvas",
    body: "A live engineering control center — project understanding, running processes, build status, test results, and a real code diff, all visible while Paw works.",
  },
  {
    title: "Universal Execution Runtime",
    body: "Paw plans, confirms, and executes real desktop actions — files, terminals, git, and your browser — narrating every step in plain language.",
  },
  {
    title: "Communication Intelligence",
    body: "Meetings, calls, and conversations become searchable memory — action items, decisions, and follow-ups extracted automatically.",
  },
  {
    title: "Your companion, your desktop",
    body: "An animated companion that lives alongside your work, not inside a browser tab — always available, always aware of what you're doing.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Your companion. Your workspace. Your world.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
          PawOS is an AI companion that lives on your desktop — it plans, executes, and remembers,
          so you can focus on the work that actually matters.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/download"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-8 py-3 font-semibold text-black hover:opacity-90"
          >
            Download PawOS
          </Link>
          <Link
            href="/docs"
            className="rounded-full border border-neutral-700 px-8 py-3 font-semibold hover:bg-neutral-900"
          >
            Read the docs
          </Link>
        </div>
      </section>

      <section className="grid gap-6 pb-16 sm:grid-cols-2">
        {BEFORE_AFTER.map((b) => (
          <div key={b.title} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
            <h3 className="text-lg font-semibold">{b.title}</h3>
            <p className="mt-2 text-sm text-neutral-400">{b.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 pb-24 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-neutral-400">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
