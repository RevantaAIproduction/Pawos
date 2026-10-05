import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { PageHeader, Panel, Row, SectionLabel, formatDate, primaryButton, secondaryButton } from "../../../components/dashboard/ui";
import { orgBilling } from "../../../lib/account/orgBilling";
import { OrgPawCompute } from "./OrgPawCompute";

export const metadata: Metadata = { title: "Spending" };

/**
 * Plan and purchase records for the signed-in account — the Autonomous Task Credits balance and
 * purchase history this dashboard has always shown, now under Spending. Reads the account's own
 * rows (row-level security) from the existing billing tables; no new billing state.
 */
export default async function DashboardSpendingPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  const [{ data: creditsRow }, { data: purchases }] = await Promise.all([
    account.supabase.from("user_task_credits").select("balance, updated_at").eq("user_id", account.user.id).maybeSingle(),
    account.supabase
      .from("task_credit_purchases")
      .select("id, credits, amount_usd, purchased_at")
      .eq("user_id", account.user.id)
      .order("purchased_at", { ascending: false })
      .limit(10),
  ]);

  const planEnds = formatDate(account.subscriptionExpiresAt);
  const canUpgrade = account.tier === "go" || account.tier === "pro" || account.tier === "build";
  const org = orgBilling(account);

  return (
    <>
      <PageHeader title="Spending" />

      <div className="space-y-10">
        <section aria-label="Plan">
          <SectionLabel>Plan</SectionLabel>
          <Panel>
            <Row
              label={
                <>
                  {account.tierLabel}
                  {account.proMaxVariant && <span className="ml-2 font-normal text-neutral-500">{account.proMaxVariant}</span>}
                </>
              }
              hint={
                org
                  ? org.isAdmin
                    ? `${org.organization.name} · ${org.roleLabel}. You manage purchases for your organization.`
                    : `${org.organization.name} · ${org.roleLabel}. Your organization's admins handle purchases — ask them if you need more usage.`
                  : planEnds
                    ? `Current period ends ${planEnds}.`
                    : "No paid subscription period on this account."
              }
            >
              {org && !org.isAdmin ? null : (
                <Link href="/pricing" className={canUpgrade ? primaryButton : secondaryButton}>
                  {canUpgrade ? "Upgrade plan" : "View plans"}
                </Link>
              )}
            </Row>
          </Panel>
        </section>

        {org && (
          <OrgPawCompute organizationId={org.organization.id} organizationName={org.organization.name} isAdmin={org.isAdmin} userId={account.user.id} />
        )}

        <section aria-label="Autonomous Task Credits">
          <SectionLabel>Autonomous Task Credits</SectionLabel>
          <Panel>
            <Row label="Balance" hint="Prepaid credits for Autonomous Engineering Tasks, shared with your PawOS desktop app.">
              <span className="text-base font-medium text-white">{creditsRow?.balance ?? 0}</span>
            </Row>
          </Panel>
        </section>

        <section aria-label="Purchase history">
          <SectionLabel>Purchase history</SectionLabel>
          <Panel>
            {purchases && purchases.length > 0 ? (
              purchases.map((purchase) => (
                <div key={purchase.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 text-sm sm:px-5">
                  <span className="text-neutral-100">{purchase.credits} credits</span>
                  <span className="text-neutral-400">${Number(purchase.amount_usd).toFixed(2)}</span>
                  <span className="text-neutral-500">{formatDate(purchase.purchased_at) ?? ""}</span>
                </div>
              ))
            ) : (
              <p className="px-4 py-4 text-sm text-neutral-500 sm:px-5">No purchases yet.</p>
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}
