import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { listIntegrations } from "../../lib/account/integrations";
import { getMyProfile } from "../../lib/account/profile";
import { getCompanion } from "../../lib/account/companionCatalog";
import { getRecentActivity, getUsageActivity, getUsageOverview } from "../../lib/account/usage";
import { getAllowance } from "../../lib/webChat/webChat";
import { Card, CardTitle, PageHeader, formatDate, primaryButton, secondaryButton } from "../../components/dashboard/ui";

function UsageBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${percent >= 100 ? "bg-amber-400" : "bg-neutral-200"}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default async function DashboardOverviewPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  const [usage, activity, recent, webAllowance, integrations, profile] = await Promise.all([
    getUsageOverview(account),
    getUsageActivity(account).catch(() => null),
    getRecentActivity(account).catch(() => null),
    getAllowance(account).catch(() => null),
    listIntegrations(account).catch(() => null),
    getMyProfile(account.supabase).catch(() => null),
  ]);

  const companion = profile ? getCompanion(profile.companionId) : undefined;
  const companionName = companion?.displayName ?? profile?.customCompanionName ?? null;
  const connected = integrations?.filter((integration) => integration.connection === "connected") ?? [];
  const canUpgrade = account.tier === "go" || account.tier === "pro" || account.tier === "build";
  const planEnds = formatDate(account.subscriptionExpiresAt);

  // The plan's own allowance leads the page; purchased or bonus allowances are listed under it.
  const included = usage?.buckets.find((bucket) => bucket.type === "monthly_plan") ?? usage?.buckets[0];
  const otherBuckets = usage?.buckets.filter((bucket) => bucket !== included) ?? [];
  const includedReset = formatDate(included?.resetsAt ?? included?.expiresAt);

  return (
    <>
      <PageHeader title="Overview" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Your included usage</CardTitle>
          {!usage ? (
            <p className="mt-4 text-sm text-neutral-500">Usage isn&apos;t available right now. Try again in a moment.</p>
          ) : !included ? (
            <p className="mt-4 text-sm text-neutral-500">No usage allowance is active on this account yet.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-base font-medium text-white">{included.percentUsed}% used</p>
                <p className="text-sm text-neutral-500">
                  {included.pcUsed.toLocaleString("en-US")} of {included.pcTotal.toLocaleString("en-US")} PC
                </p>
              </div>
              <div className="mt-4">
                <UsageBar percent={included.percentUsed} />
              </div>
              <p className="mt-4 text-sm text-neutral-500">
                {usage.limitReached ? "Limit reached. " : ""}
                {includedReset ? `Resets ${includedReset}` : included.label}
              </p>
            </>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-base font-medium text-white">{account.tierLabel}</h2>
            {account.proMaxVariant && <span className="text-sm text-neutral-500">{account.proMaxVariant}</span>}
          </div>
          <p className="mt-3 text-sm text-neutral-300">
            {planEnds ? `Current period ends ${planEnds}.` : account.tier === "go" ? "The free PawOS plan." : "Managed through your organization or PawOS."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {canUpgrade ? (
              <Link href="/pricing" className={primaryButton}>
                Upgrade plan
              </Link>
            ) : (
              <Link href="/dashboard/spending" className={secondaryButton}>
                View spending
              </Link>
            )}
          </div>
        </Card>
      </div>

      {otherBuckets.length > 0 && (
        <Card className="mt-4">
          <CardTitle>Additional allowances</CardTitle>
          <ul className="mt-4 space-y-4">
            {otherBuckets.map((bucket) => {
              const reset = formatDate(bucket.resetsAt);
              const expires = formatDate(bucket.expiresAt);
              return (
                <li key={bucket.id}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium text-neutral-200">{bucket.label}</span>
                    <span className="text-sm text-neutral-500">
                      {bucket.pcUsed.toLocaleString("en-US")} of {bucket.pcTotal.toLocaleString("en-US")} PC
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
        </Card>
      )}

      <Card className="mt-4">
        <CardTitle>Where you used PawOS</CardTitle>
        {webAllowance?.messageLimit != null ? (
          // Paw Go: Web chat is a fixed number of messages and is not charged to a usage allowance.
          <>
            <p className="mt-4 text-base font-medium text-white">
              {webAllowance.messagesUsed} / {webAllowance.messageLimit} web messages used
            </p>
            <p className="mt-0.5 text-sm text-neutral-300">{webAllowance.remaining} remaining</p>
            <p className="mt-1 text-sm text-neutral-400">{account.tierLabel} includes {webAllowance.messageLimit} messages on PawOS Web in total. Work in the desktop app is not counted here.</p>
          </>
        ) : !activity ? (
          <p className="mt-4 text-sm text-neutral-500">Activity isn&apos;t available right now.</p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              {([["Web", activity.web], ["Desktop", activity.desktop]] as const).map(([label, surface]) => (
                <div key={label}>
                  <dt className="text-sm text-neutral-500">{label}</dt>
                  <dd className="mt-1 text-base font-medium text-white">
                    {surface.requests.toLocaleString("en-US")} {surface.requests === 1 ? "request" : "requests"}
                  </dd>
                  <dd className="text-sm text-neutral-500">{surface.pc.toLocaleString("en-US")} PC</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-neutral-500">
              {activity.events === 0 ? "No usage recorded yet. " : `From your last ${activity.events.toLocaleString("en-US")} usage records. `}
              Web and Desktop draw on the same allowance.
            </p>
          </>
        )}
        <Link href="/app" className={`${secondaryButton} mt-5`}>
          Open PawOS Web
        </Link>
      </Card>

      <Card className="mt-4">
        <CardTitle>Recent activity</CardTitle>
        {!recent ? (
          <p className="mt-4 text-sm text-neutral-500">Activity isn&apos;t available right now.</p>
        ) : recent.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">Nothing yet. Chats on PawOS Web and work in the desktop app show up here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-800/80">
            {recent.map((item, index) => (
              <li key={`${item.at}-${index}`} className="flex min-w-0 items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{item.label}</span>
                <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">{item.surface === "web" ? "Web" : "Desktop"}</span>
                <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">{formatDate(item.at) ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Companion</CardTitle>
          <p className="mt-4 text-base font-medium text-white">{companionName ?? "Not available"}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {!profile ? "Companion settings aren't available right now." : companion ? "Your PawOS desktop companion." : "A custom companion made in the desktop app."}
          </p>
          <Link href="/dashboard/companion" className={`${secondaryButton} mt-5`}>
            Manage companion
          </Link>
        </Card>

        <Card>
          <CardTitle>Integrations</CardTitle>
          {!integrations ? (
            <p className="mt-4 text-sm text-neutral-500">Connection state isn&apos;t available right now.</p>
          ) : (
            <>
              <p className="mt-4 text-base font-medium text-white">{connected.length === 0 ? "None connected" : `${connected.length} connected`}</p>
              <p className="mt-1 text-sm text-neutral-400">
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
