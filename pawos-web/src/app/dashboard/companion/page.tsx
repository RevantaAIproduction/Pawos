import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { COMPANION_CATALOG, isCompanionAvailable } from "../../../lib/account/companionCatalog";
import { getMyProfile, type AccountProfile } from "../../../lib/account/profile";
import { PageHeader } from "../../../components/dashboard/ui";
import { CompanionManager } from "./CompanionManager";

export const metadata: Metadata = { title: "Companion" };

export default async function DashboardCompanionPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  let profile: AccountProfile | null = null;
  try {
    profile = await getMyProfile(account.supabase);
  } catch {
    profile = null;
  }

  return (
    <>
      <PageHeader title="Companion" description="Your PawOS desktop companion. One selection for your account, used by the desktop app and shown on your public profile." />
      {profile ? (
        <CompanionManager
          catalog={COMPANION_CATALOG.map((entry) => ({ ...entry, available: isCompanionAvailable(entry, account.tier) }))}
          initial={{ companionId: profile.companionId, customCompanionName: profile.customCompanionName }}
        />
      ) : (
        <p className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
          Companion settings aren&apos;t available right now. Try again in a moment.
        </p>
      )}
    </>
  );
}
