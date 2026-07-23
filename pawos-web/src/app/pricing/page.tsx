import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "./PricingPlans";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "PawOS pricing: Go, Pro, Pro Max, Team, and Enterprise plans, plus Autonomous Engineering Task pricing.",
};

const COMPARISON_ROWS: { feature: string; go: string; pro: string; proMax: string; team: string; enterprise: string }[] = [
  { feature: "Companion Studio & Desktop Companion", go: "✓", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "AI models & reasoning runtimes", go: "—", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "Autonomous Ticket Resolution", go: "—", pro: "Metered", proMax: "Metered", team: "Included allowance + metered", enterprise: "Included allowance + custom metered" },
  { feature: "Shared Organization Workspaces", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Admin controls & credential vault", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Governance policies & audit log", go: "—", pro: "—", proMax: "—", team: "Basic", enterprise: "Advanced" },
  { feature: "Support", go: "Community", pro: "Standard", proMax: "Priority", team: "Priority", enterprise: "Dedicated" },
];

const FAQS = [
  {
    q: "How does Autonomous Engineering Task billing work?",
    a: "Each plan includes a real monthly allowance of Autonomous Engineering Tasks. Once that allowance is used, additional completed tasks are billed at a flat per-task rate. You're only ever charged once a task genuinely completes — a real pull request is opened and the ticket is updated. A task that fails, is cancelled, hits a retry limit, or is denied approval is never billed.",
  },
  {
    q: "Can I change plans anytime?",
    a: "Yes. Upgrades, downgrades, and renewals are self-serve from inside the app — no sales call required for Go, Pro, or Pro Max.",
  },
  {
    q: "What counts as a 'seat' on Team or Enterprise?",
    a: "One seat is one member of your organization workspace. Seats are billed monthly per the plan's per-seat rate; Team supports 2–150 seats, Enterprise starts at 20 seats with custom terms above that.",
  },
  {
    q: "Do unused Autonomous Engineering Task credits roll over?",
    a: "No — the included monthly allowance resets each billing period and does not carry over, consistent with how the allowance is designed to cover typical monthly usage rather than accumulate.",
  },
  {
    q: "What's your refund policy?",
    a: "See our Refund Policy for the full terms. In short: monthly subscriptions can be cancelled anytime to stop future billing, and we handle billing errors on a case-by-case basis — reach out to billing support.",
  },
];

export default function PricingPage() {
  return (
    <>
      <Section title="Simple, honest pricing" subtitle="Start free on Paw Go. Upgrade to Pro or Pro Max whenever you're ready, or set up Team and Enterprise seats for your organization.">
        <PricingPlans />
      </Section>

      <Section eyebrow="Compare plans" title="What's included" className="border-t border-neutral-900">
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="py-3 pr-4 font-medium">Feature</th>
                <th className="py-3 px-4 font-medium">Go</th>
                <th className="py-3 px-4 font-medium">Pro</th>
                <th className="py-3 px-4 font-medium">Pro Max</th>
                <th className="py-3 px-4 font-medium">Team</th>
                <th className="py-3 px-4 font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-neutral-900">
                  <td className="py-3 pr-4 text-neutral-300">{row.feature}</td>
                  <td className="py-3 px-4 text-neutral-400">{row.go}</td>
                  <td className="py-3 px-4 text-neutral-400">{row.pro}</td>
                  <td className="py-3 px-4 text-neutral-400">{row.proMax}</td>
                  <td className="py-3 px-4 text-neutral-400">{row.team}</td>
                  <td className="py-3 px-4 text-neutral-400">{row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="autonomous-engineering" eyebrow="Autonomous Engineering" title="Pay only for completed work" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-8 max-w-2xl space-y-4 text-neutral-400">
          <p>
            Autonomous Ticket Resolution is billed as a completed <strong className="text-neutral-200">Autonomous Engineering Task</strong> —
            never as chat, tokens, or time. A task only counts, and only bills, once Paw has genuinely opened a
            real pull request and updated the originating ticket.
          </p>
          <ul className="space-y-2">
            <li>• Every plan includes a real monthly allowance before metered billing starts.</li>
            <li>• Additional completed tasks beyond your allowance are billed at a flat per-task rate.</li>
            <li>• A task that fails, is cancelled, hits its retry limit, or is denied approval is <strong className="text-neutral-200">never</strong> billed.</li>
            <li>• Enterprise plans can negotiate custom per-task rates at volume.</li>
          </ul>
        </div>
      </Section>

      <Section eyebrow="FAQ" title="Billing questions" className="border-t border-neutral-900">
        <div className="mx-auto mt-8 max-w-2xl divide-y divide-neutral-900">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-left font-medium text-neutral-100">
                {item.q}
                <span className="ml-4 text-neutral-500 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-neutral-400">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-neutral-500">
          Full terms: <Link href="/legal/refund-policy" className="text-blue-400 hover:underline">Refund Policy</Link>{" · "}
          <Link href="/faq" className="text-blue-400 hover:underline">General FAQ</Link>
        </p>
      </Section>

      <Section className="text-center border-t border-neutral-900">
        <h2 className="text-2xl font-bold">Need a custom Enterprise quote?</h2>
        <p className="mx-auto mt-3 max-w-md text-neutral-400">Talk to our team about volume pricing, custom deployment, and dedicated support.</p>
        <div className="mt-6">
          <Button href="/support/sales" variant="secondary">Contact sales</Button>
        </div>
      </Section>
    </>
  );
}
