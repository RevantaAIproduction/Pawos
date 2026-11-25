import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "./PricingPlans";
import { Section } from "../../components/ui/Section";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Compare PawOS plans, included Paw Compute and organization options. Review the in-app billing screen for account-specific usage prices and limits.",
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
    a: "Ticket Balance is separate from your subscription and Paw Compute. A ticket needs at least $5 available to start; that amount is held while it runs. Completed tickets are charged by recorded change size: one file and up to 10 lines costs $1; up to 3 size units costs $5; 4–9 costs $7.50; 10–20 costs $10; 21–30 costs $15; 31–50 costs $20 plus $0.50 per unit above 30; above 50 costs $30 plus $0.50 per unit above 50. Size is the greater of files changed or ceiling(lines changed ÷ 100). If size evidence is unavailable, the standard $5 rate applies. Automatic retries cost $3 when started. Cancellation after execution starts costs up to $2.50; failed runs cost $0. A completed change may cost more than the initial $5 hold and leave a negative balance, which must be topped up before another ticket starts. Enterprise uses separate pass-through terms.",
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
      <Section id="individual-plans" title="Plans for individual developers and engineering teams" subtitle="Choose an individual plan or talk with the team about organization seats, shared usage and administration. Plan features and included usage are described below; account-specific rates and limits are confirmed in billing." className="scroll-mt-24">
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

      <Section id="autonomous-engineering" eyebrow="Autonomous Ticket System" title="Separate, evidence-based ticket pricing" className="border-t border-neutral-900 bg-neutral-900/30">
        <div className="mx-auto mt-8 max-w-4xl space-y-6 text-neutral-400">
          <p>Ticket Balance is a prepaid wallet, separate from your subscription and Paw Compute. A ticket requires at least <strong className="text-neutral-100">$5 available to start</strong>; that amount is held while work runs. The final completed-ticket charge is based on recorded change size.</p>
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-neutral-800 text-left text-neutral-300"><th className="p-3">Change size</th><th className="p-3">Completed-ticket charge</th></tr></thead>
              <tbody className="divide-y divide-neutral-800">
                <tr><td className="p-3">1 file and up to 10 lines</td><td className="p-3 font-semibold text-white">$1.00</td></tr>
                <tr><td className="p-3">Up to 3 size units</td><td className="p-3 font-semibold text-white">$5.00</td></tr>
                <tr><td className="p-3">4–9 size units</td><td className="p-3 font-semibold text-white">$7.50</td></tr>
                <tr><td className="p-3">10–20 size units</td><td className="p-3 font-semibold text-white">$10.00</td></tr>
                <tr><td className="p-3">21–30 size units</td><td className="p-3 font-semibold text-white">$15.00</td></tr>
                <tr><td className="p-3">31–50 size units</td><td className="p-3 font-semibold text-white">$20 + $0.50 per unit above 30</td></tr>
                <tr><td className="p-3">Above 50 size units</td><td className="p-3 font-semibold text-white">$30 + $0.50 per unit above 50</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm">Size units = the greater of files changed or ceiling(lines changed ÷ 100). If change-size evidence is unavailable, the standard $5 rate applies.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-800 p-4"><p className="font-semibold text-white">Automatic retry</p><p className="mt-1 text-sm">$3.00 when a retry starts</p></div>
            <div className="rounded-xl border border-neutral-800 p-4"><p className="font-semibold text-white">Cancellation</p><p className="mt-1 text-sm">Up to $2.50 if execution has started</p></div>
            <div className="rounded-xl border border-neutral-800 p-4"><p className="font-semibold text-white">Failure</p><p className="mt-1 text-sm">$0 ticket charge</p></div>
          </div>
          <p className="text-sm">A completed ticket may cost more than the initial $5 hold and can leave a negative balance. Another ticket cannot start until the balance is topped up. Current top-up minimum is $30; maximum is $20,000.</p>
          <p className="text-xs text-neutral-500">These rates describe the individual/Team Ticket Balance model. Enterprise task usage follows separately agreed pass-through terms. Check the in-app billing screen before purchase or execution.</p>
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
