import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "./PricingPlans";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Compare PawOS individual and organization plans, included Paw Compute, and additional usage terms.",
};

const COMPARISON_ROWS: { feature: string; go: string; pro: string; proMax: string; team: string; enterprise: string }[] = [
  { feature: "Companion Studio & Desktop Companion", go: "✓", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "Paw Compute (PC) included", go: "500 PC every 14 days", pro: "2,000 PC per billing period", proMax: "10,000 PC (5x) or 25,000 PC (20x) per billing period", team: "Per seat: 2,000 PC (Standard) or 10,000 PC (Premium) a month", enterprise: "Shared organization pool" },
  { feature: "AI models & reasoning runtimes", go: "—", pro: "✓", proMax: "✓", team: "✓", enterprise: "✓" },
  { feature: "Autonomous Ticket System billing", go: "—", pro: "—", proMax: "Prepaid balance", team: "See organization terms", enterprise: "Seat fee + pass-through usage" },
  { feature: "Shared Workspaces & Companions", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Shared credit pool", go: "—", pro: "—", proMax: "—", team: "—", enterprise: "✓" },
  { feature: "Task Management & Git Collaboration (PR Review)", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Remote Assistance & CRM Projection", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Credential Vault, Approval Queue & Audit Log", go: "—", pro: "—", proMax: "—", team: "✓", enterprise: "✓" },
  { feature: "Seat rates", go: "—", pro: "—", proMax: "—", team: "Standard $20 / Premium $100", enterprise: "$20/seat + tax + usage" },
  { feature: "RBAC roles", go: "—", pro: "—", proMax: "—", team: "Owner, Billing/Workspace Admin, Member", enterprise: "+ IT Admin, Security Admin, Dept. Manager" },
];

const FAQS = [
  {
    q: "How does Autonomous Ticket System billing work?",
    a: "Autonomous Ticket System usage is paid from a prepaid balance separate from your subscription. The available top-up amounts and minimum, and the rate for a completed run, are shown in the billing screen and can depend on your account or organization. Enterprise usage is billed at pass-through provider rates under its organization terms. Review the displayed price before adding funds or starting paid work. Failed, cancelled or approval-denied runs are not charged under the current billing rules.",
  },
  {
    q: "How is usage measured?",
    a: "Usage is measured in Paw Compute (PC). Pro includes 2,000 PC per billing period, Pro Max 5x includes 10,000 PC, and Pro Max 20x includes 25,000 PC. A weekly limit spreads that usage across the period — 1,000 PC per week on Pro, 5,000 PC on Pro Max 5x, and 12,500 PC on Pro Max 20x — and the rest of your plan stays available after each weekly reset. Included plan PC does not carry over to the next billing period. Paw Go includes 500 PC every 14 days. Need more? Credits are $1 for 100 PC and never expire.",
  },
  {
    q: "Can I change plans anytime?",
    a: "Yes. Go, Pro and Pro Max upgrades, downgrades and renewals are self-serve from inside the app. Team and Enterprise are set up with our sales team — contact sales and we'll size seats and usage for your organization.",
  },
  {
    q: "What counts as a 'seat' on Team or Enterprise?",
    a: "A seat is one member of your organization workspace. Team supports 2–150 seats with Standard and Premium options; each seat has its own included Paw Compute. Enterprise starts at 20 seats and has separate usage terms. Contact sales for the current Enterprise price and usage details; it does not use the standard tiered Ticket Balance rates.",
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
      <Section id="individual-plans" title="Plans and pricing" subtitle="Start with Paw Go, compare the individual plans, or contact the team about Team and Enterprise." className="scroll-mt-24">
        <PricingPlans />
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200">Get Started</Link>
          <Link href="/login" className="inline-flex items-center justify-center rounded-full border border-neutral-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900">Log in</Link>
        </div>
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

      <Section id="autonomous-engineering" eyebrow="Autonomous Ticket System" title="Understand usage before a run" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-8 max-w-2xl space-y-4 text-neutral-400">
          <p>
            Autonomous Ticket System usage is billed from a <strong className="text-neutral-200">prepaid balance</strong> separate from your subscription. Top-up limits and run rates are account-controlled; the billing screen shows the current amounts for your account before you pay.
          </p>
          <ul className="space-y-2">
            <li>• The billing screen shows the available top-up amounts and minimum for your account.</li>
            <li>• Individual and Team run rates may follow configured volume tiers. Enterprise usage is billed at pass-through provider rates under its organization terms.</li>
          </ul>
          <ul className="space-y-2">
            <li>• Check the current balance, run terms and any approval steps in the app before starting paid work.</li>
            <li>• Under current billing rules, failed, cancelled or approval-denied runs are not charged.</li>
            <li>• If your balance cannot cover a run, the app will ask you to add funds before proceeding.</li>
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

      <Section className="border-t border-neutral-900 text-center">
        <h2 className="text-2xl font-bold">Choosing a Team or Enterprise plan?</h2>
        <p className="mx-auto mt-3 max-w-md text-neutral-400">Talk with the team about seat options and usage for your organization.</p>
        <div className="mt-6"><Link href="/support/sales" className="inline-flex items-center justify-center rounded-full border border-neutral-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-900">Contact sales</Link></div>
      </Section>
    </>
  );
}
