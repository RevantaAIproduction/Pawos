import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { Card, CardTitle, PageHeader, formatDate, secondaryButton } from "../../../components/dashboard/ui";

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

  return (
    <>
      <PageHeader title="Spending" description="Your plan, credits and purchases." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Plan</CardTitle>
          <p className="mt-3 text-2xl font-semibold text-white">
            {account.tierLabel}
            {account.proMaxVariant && <span className="ml-2 text-base font-normal text-neutral-400">{account.proMaxVariant}</span>}
          </p>
          <p className="mt-1 text-sm text-neutral-500">{planEnds ? `Current period ends ${planEnds}.` : "No paid subscription period on this account."}</p>
          <Link href="/pricing" className={`${secondaryButton} mt-5`}>
            View plans
          </Link>
        </Card>

        <Card>
          <CardTitle>Autonomous Task Credits</CardTitle>
          <p className="mt-3 text-3xl font-semibold text-white">{creditsRow?.balance ?? 0}</p>
          <p className="mt-1 text-sm text-neutral-500">Prepaid credits for Autonomous Engineering Tasks, shared with your PawOS desktop app.</p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>Purchase history</CardTitle>
        {purchases && purchases.length > 0 ? (
          <ul className="mt-3 divide-y divide-neutral-800 text-sm">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
                <span className="text-neutral-200">{purchase.credits} credits</span>
                <span className="text-neutral-400">${Number(purchase.amount_usd).toFixed(2)}</span>
                <span className="text-neutral-500">{formatDate(purchase.purchased_at) ?? ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No purchases yet.</p>
        )}
      </Card>
    </>
  );
}
