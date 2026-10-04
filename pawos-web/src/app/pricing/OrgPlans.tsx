import Link from "next/link";

/**
 * Pricing > Team and Enterprise. Both plans are sold through sales ("Contact sales" → /support/sales).
 * Plan facts mirror the desktop app's catalog (src/main/billing/PricingConfigStore.ts).
 */

type FeatureGroup = { title: string; items: string[] };

interface OrgPlan {
  id: "team" | "enterprise";
  name: string;
  summary: string;
  audience: string;
  price: string;
  priceUnit: string;
  priceNote: string;
  inherits: string;
  groups: FeatureGroup[];
  highlighted?: boolean;
}

const TEAM: OrgPlan = {
  id: "team",
  name: "Team",
  summary: "Each member gets their own seat’s usage — no shared pool — with shared workspaces and admin controls.",
  audience: "2–150 members",
  price: "$20",
  priceUnit: "per seat / month",
  priceNote: "Premium seats $100 per seat / month",
  inherits: "Everything in Pro Max, plus",
  groups: [
    {
      title: "Collaboration",
      items: ["Shared workspaces and companions", "Task management and assignment", "AI-assisted Git collaboration (PR review)", "Remote assistance (screen share and control)"],
    },
    {
      title: "Administration and security",
      items: ["Organization members and admin controls", "Credential vault and approval queue", "Audit log", "SSO configuration (policy-level)"],
    },
    {
      title: "Billing",
      items: ["Team billing with Standard and Premium seats", "CRM projection"],
    },
  ],
};

const ENTERPRISE: OrgPlan = {
  id: "enterprise",
  name: "Enterprise",
  summary: "Flexible pooled usage and advanced roles for organizations at scale.",
  audience: "20+ members",
  price: "$20",
  priceUnit: "per seat / month",
  priceNote: "Plus usage at API rates",
  inherits: "Everything in Team, plus",
  highlighted: true,
  groups: [
    {
      title: "Usage and billing",
      items: [
        "Pooled usage shared across the organization",
        "Shared credit pool",
        "Uniform seat rate — no Standard / Premium split",
        "Autonomous Ticket System billed at pass-through API rates",
        "Charged only for completed tasks — never failed, cancelled or denied runs",
      ],
    },
    {
      title: "Governance",
      items: ["Additional roles: IT Administrator, Security Administrator, Department Manager"],
    },
  ],
};

const SEATS = [
  { name: "Standard", price: "$20", detail: "2,000 PC a month per member (Pro-level)" },
  { name: "Premium", price: "$100", detail: "10,000 PC a month per member (Pro Max 5x-level)" },
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-400">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({ plan }: { plan: OrgPlan }) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl border p-7 sm:p-8 ${
        plan.highlighted ? "border-blue-500/40 bg-gradient-to-b from-blue-500/[0.07] to-neutral-900/60 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]" : "border-neutral-800 bg-neutral-900/50"
      }`}
      aria-labelledby={`plan-${plan.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={`plan-${plan.id}`} className="text-xl font-semibold tracking-tight text-white">
          {plan.name}
        </h3>
        <span className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs font-medium text-neutral-300">{plan.audience}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{plan.summary}</p>

      <div className="mt-6">
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-white">{plan.price}</span>
          <span className="text-sm text-neutral-400">{plan.priceUnit}</span>
        </p>
        <p className="mt-1 text-sm text-neutral-500">{plan.priceNote}</p>
      </div>

      <Link
        href={`/support/sales?plan=${plan.id}`}
        className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
          plan.highlighted ? "bg-white text-neutral-950 hover:bg-neutral-200" : "border border-neutral-700 text-white hover:bg-neutral-800"
        }`}
        data-testid={`contact-sales-${plan.id}`}
      >
        Contact sales
      </Link>

      {plan.id === "team" && (
        <div className="mt-6 divide-y divide-neutral-800 rounded-xl border border-neutral-800">
          {SEATS.map((seat) => (
            <div key={seat.name} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-neutral-200">{seat.name} seat</p>
                <p className="text-xs text-neutral-500">{seat.detail}</p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-white">
                {seat.price}
                <span className="font-normal text-neutral-500"> /mo</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 border-t border-neutral-800 pt-6">
        <p className="text-sm font-medium text-neutral-200">{plan.inherits}:</p>
        <div className="mt-4 space-y-5">
          {plan.groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{group.title}</p>
              <ul className="mt-2.5 space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-neutral-300">
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function OrgPlans() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-2">
        <PlanCard plan={TEAM} />
        <PlanCard plan={ENTERPRISE} />
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-6 py-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-white">Not sure which plan fits?</p>
          <p className="mt-1 text-sm text-neutral-400">We&apos;ll help you size seats and usage and plan the rollout for your organization.</p>
        </div>
        <Link
          href="/support/sales"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Talk to sales
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
