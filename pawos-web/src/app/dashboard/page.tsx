import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { listIntegrations } from "../../lib/account/integrations";
import { getMyProfile } from "../../lib/account/profile";
import { getCompanion } from "../../lib/account/companionCatalog";
import { getUsageOverview } from "../../lib/account/usage";
import { Card, CardTitle, PageHeader, formatDate, primaryButton, secondaryButton } from "../../components/dashboard/ui";

function UsageBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${percent >= 100 ? "bg-amber-400" : "bg-neutral-200"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default async function DashboardOverviewPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  const [usage, integrations, profile] = await Promise.all([
    getUsageOverview(account),
    listIntegrations(account).catch(() => null),
    getMyProfile(account.supabase).catch(() => null),
  ]);

  const companion = profile ? getCompanion(profile.companionId) : undefined;
  const companionName = companion?.displayName ?? profile?.customCompanionName ?? null;
  const connected = integrations?.filter((integration) => integration.connection === "connected") ?? [];
  const canUpgrade = account.tier === "go" || account.tier === "pro" || account.tier === "build";
  const planEnds = formatDate(account.subscriptionExpiresAt);

  return (
    <>
      <PageHeader title="Overview" description={`Signed in as ${account.displayName}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardTitle>Plan</CardTitle>
          <p className="mt-3 text-2xl font-semibold text-white">
            {account.tierLabel}
            {account.proMaxVariant && <span className="ml-2 text-base font-normal text-neutral-400">{account.proMaxVariant}</span>}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {planEnds ? `Current period ends ${planEnds}.` : account.tier === "go" ? "The free PawOS plan." : "Managed through your organization or PawOS."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {canUpgrade && (
              <Link href="/pricing" className={primaryButton}>
                Upgrade
              </Link>
            )}
            <Link href="/dashboard/spending" className={secondaryButton}>
              Spending
            </Link>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Usage</CardTitle>
            {usage?.limitReached && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">Limit reached</span>}
          </div>
          {!usage ? (
            <p className="mt-3 text-sm text-neutral-500">Usage isn&apos;t available right now. Try again in a moment.</p>
          ) : usage.buckets.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No usage allowance is active on this account yet.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {usage.buckets.map((bucket) => {
                const reset = formatDate(bucket.resetsAt);
                const expires = formatDate(bucket.expiresAt);
                return (
                  <li key={bucket.id}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium text-neutral-200">{bucket.label}</span>
                      <span className="text-sm text-neutral-400">
                        {bucket.pcUsed.toLocaleString("en-US")} of {bucket.pcTotal.toLocaleString("en-US")} PC used
                      </span>
                    </div>
                    <UsageBar percent={bucket.percentUsed} />
                    <p className="mt-1.5 text-xs text-neutral-500">
                      {bucket.percentUsed}% used
                      {reset ? ` · resets ${reset}` : expires ? ` · expires ${expires}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {usage?.weeklyPacing && (
            <p className="mt-4 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
              Weekly pacing: {usage.weeklyPacing.percentUsed}% used
              {formatDate(usage.weeklyPacing.resetsAt) ? ` · resets ${formatDate(usage.weeklyPacing.resetsAt)}` : ""}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-1">
          <CardTitle>Companion</CardTitle>
          <p className="mt-3 text-lg font-medium text-white">{companionName ?? "Not available"}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {!profile
              ? "Companion settings aren't available right now."
              : companion
                ? "Your PawOS desktop companion."
                : "A custom companion made in the desktop app."}
          </p>
          <Link href="/dashboard/companion" className={`${secondaryButton} mt-5`}>
            Manage companion
          </Link>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Integrations</CardTitle>
          {!integrations ? (
            <p className="mt-3 text-sm text-neutral-500">Connection state isn&apos;t available right now.</p>
          ) : (
            <>
              <p className="mt-3 text-lg font-medium text-white">
                {connected.length === 0 ? "No integrations connected" : `${connected.length} connected`}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {connected.length > 0
                  ? connected.map((integration) => integration.name).join(", ")
                  : `${integrations.filter((integration) => integration.entitled).length} of ${integrations.length} available on ${account.tierLabel}.`}
              </p>
            </>
          )}
          <Link href="/dashboard/integrations" className={`${secondaryButton} mt-5`}>
            View integrations
          </Link>
        </Card>
      </div>
    </>
  );
}
