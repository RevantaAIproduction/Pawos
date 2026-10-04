import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "../../../components/ui/Container";
import { CONTACT_EMAILS, mailto } from "../../../lib/config/contactConfig";

export const metadata: Metadata = {
  title: "Contact sales",
  description: "Talk to the PawOS team about Team and Enterprise plans: seats, usage, rollout and security.",
};

type PlanId = "team" | "enterprise";

const PLANS: Record<PlanId, { name: string; price: string; detail: string; subject: string }> = {
  team: {
    name: "Team",
    price: "$20 per seat / month",
    detail: "Standard and Premium seats · 2–150 members",
    subject: "PawOS Team plan inquiry",
  },
  enterprise: {
    name: "Enterprise",
    price: "$20 per seat / month + usage",
    detail: "Pooled usage at API rates · 20+ members",
    subject: "PawOS Enterprise plan inquiry",
  },
};

const INCLUDE = [
  "Your organization and how many people will use PawOS",
  "Which plan you're considering, and Standard / Premium seat mix for Team",
  "When you'd like to roll out",
  "Any security, SSO or compliance requirements",
];

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const raw = (await searchParams).plan;
  const selected: PlanId | null = raw === "team" || raw === "enterprise" ? raw : null;
  const subject = selected ? PLANS[selected].subject : "PawOS Team / Enterprise inquiry";

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Team and Enterprise</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Talk to sales</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-400">
            We&apos;ll help you choose the right plan, size seats and usage, and get your organization set up on PawOS.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const plan = PLANS[id];
              const active = selected === id;
              return (
                <Link
                  key={id}
                  href={`/support/sales?plan=${id}`}
                  aria-current={active ? "true" : undefined}
                  className={`rounded-xl border p-5 transition ${
                    active ? "border-blue-500/50 bg-blue-500/[0.06]" : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold text-white">{plan.name}</p>
                    {active && <span className="text-xs font-medium text-blue-300">Selected</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{plan.price}</p>
                  <p className="mt-1 text-xs text-neutral-500">{plan.detail}</p>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white">Email our sales team</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Write to{" "}
              <a href={mailto("sales", subject)} className="font-medium text-blue-300 hover:text-blue-200">
                {CONTACT_EMAILS.sales}
              </a>{" "}
              and we&apos;ll get back to you. It helps to include:
            </p>
            <ul className="mt-4 space-y-2">
              {INCLUDE.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-neutral-300">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={mailto("sales", subject)}
                className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
                data-testid="email-sales"
              >
                Email sales
              </a>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Compare plans
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
