import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "./PricingPlans";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "PawOS pricing: Go, Pro, Pro Max, Team, and Enterprise plans, plus volume-tiered Autonomous Ticket System pricing.",
};

const COMPARISON_ROWS: { feature: string; go: string; pro: string; proMax: string; team: string; enterprise: string }[] = [
  { feature: "Companion Studio & Desktop Companion", go: "✓", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "AI models & reasoning runtimes", go: "—", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "Autonomous Ticket System billing", go: "—", pro: "Ticket Balance", proMax: "Ticket Balance", team: "Ticket Balance (shared)", enterprise: "Seat fee + usage at API rates" },
  { feature: "Shared Workspaces, Companions & Credit Pool", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Task Management & Git Collaboration (PR Review)", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Remote Assistance & CRM Projection", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Credential Vault, Approval Queue & Audit Log", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Seat rates", go: "—", pro: "—", proMax: "—", team: "Standard $20 / Premium $100", enterprise: "$20/seat + tax + usage" },
  { feature: "RBAC roles", go: "—", pro: "—", proMax: "—", team: "Owner, Billing/Workspace Admin, Member", enterprise: "+ IT Admin, Security Admin, Dept. Manager" },
];

const FAQS = [
  {
    q: "How does Autonomous Ticket System billing work?",
    a: "The Autonomous Ticket System is billed through a Ticket Balance — a prepaid dollar wallet, completely separate from your subscription. Add funds anytime from inside the app (any amount, $30 minimum). Each genuinely completed ticket deducts a real dollar amount from that balance — never for chat, tokens, or time, and never until a real pull request is opened and the ticket is updated. The rate per ticket is volume-tiered by your account's (or organization's) cumulative completed-ticket count: $5.00/ticket for your first 500, $4.50 for tickets 501–2,000, $4.00 for 2,001–10,000, $3.50 for 10,001–25,000, and $3.00/ticket beyond that — so the more you use it, the less each ticket costs. A ticket that fails, is cancelled, hits a retry limit, or is denied approval never deducts anything. Run low and PawOS simply prompts you to add funds before starting a new ticket.",
  },
  {
    q: "Can I change plans anytime?",
    a: "Yes. Upgrades, downgrades, and renewals are self-serve from inside the app for every plan, including Team and Enterprise — no sales call required.",
  },
  {
    q: "What counts as a 'seat' on Team or Enterprise?",
    a: "One seat is one member of your organization workspace. Team seats come in two rates — Standard ($20/seat/mo) and Premium ($100/seat/mo) — mixed freely across your 2–150 members. Enterprise seats are uniform at a $20/seat/mo base fee (20+ seats), with Autonomous Ticket System usage billed separately through the same volume-tiered Ticket Balance.",
  },
  {
    q: "Does an unused Ticket Balance roll over?",
    a: "Yes — a Ticket Balance never expires and rolls over indefinitely. You're topping up a balance, not a monthly allowance, so unused funds simply stay on the account until they're used.",
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

      <Section id="autonomous-engineering" eyebrow="Autonomous Ticket System" title="Pay only for completed work" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-8 max-w-2xl space-y-4 text-neutral-400">
          <p>
            Autonomous Ticket Resolution is billed through a <strong className="text-neutral-200">Ticket Balance</strong> — a
            prepaid dollar wallet completely separate from your subscription — never as chat, tokens, or time. A
            real dollar amount is deducted only once Paw has genuinely opened a pull request and updated the
            originating ticket.
          </p>
          <ul className="space-y-2">
            <li>• Add funds anytime from inside the app — any amount, $30 minimum.</li>
            <li>• Per-ticket pricing is volume-tiered by your account&apos;s (or organization&apos;s) cumulative completed-ticket count:</li>
          </ul>
          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 px-4 font-medium">Cumulative tickets</th>
                  <th className="py-2 px-4 font-medium">Rate per ticket</th>
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                <tr className="border-b border-neutral-900"><td className="py-2 px-4">1 – 500</td><td className="py-2 px-4">$5.00</td></tr>
                <tr className="border-b border-neutral-900"><td className="py-2 px-4">501 – 2,000</td><td className="py-2 px-4">$4.50</td></tr>
                <tr className="border-b border-neutral-900"><td className="py-2 px-4">2,001 – 10,000</td><td className="py-2 px-4">$4.00</td></tr>
                <tr className="border-b border-neutral-900"><td className="py-2 px-4">10,001 – 25,000</td><td className="py-2 px-4">$3.50</td></tr>
                <tr><td className="py-2 px-4">25,000+</td><td className="py-2 px-4">$3.00</td></tr>
              </tbody>
            </table>
          </div>
          <ul className="space-y-2">
            <li>• Balance never expires and rolls over indefinitely — you&apos;re topping up a wallet, not a monthly allowance.</li>
            <li>• A ticket that fails, is cancelled, hits its retry limit, or is denied approval <strong className="text-neutral-200">never</strong> deducts anything.</li>
            <li>• Low balance? PawOS prompts you to add funds before starting a new ticket — nothing runs on an empty balance.</li>
            <li>• Purchase and usage history are fully visible in-app, with CSV export.</li>
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
        <h2 className="text-2xl font-bold">Ready for Team or Enterprise?</h2>
        <p className="mx-auto mt-3 max-w-md text-neutral-400">
          Set up your organization directly from the app — 2–150 seats on Team, 20+ seats on Enterprise. No sales
          call required.
        </p>
        <div className="mt-6">
          <Button href="/download" variant="secondary">Get started</Button>
        </div>
      </Section>
    </>
  );
}
