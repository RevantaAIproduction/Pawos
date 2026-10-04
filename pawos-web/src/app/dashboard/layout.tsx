import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../lib/account/accountContext";
import { DashboardShell } from "../../components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Every /dashboard page renders inside this layout, and it is the sign-in gate for all of them:
 * no session, no dashboard. (The data itself is separately protected — each page and every
 * /api/dashboard route resolves the account again on the server.)
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");

  return (
    <DashboardShell
      displayName={account.displayName}
      email={account.user.email ?? null}
      avatarUrl={account.avatarUrl}
      tierLabel={account.tierLabel}
      canUpgrade={account.tier === "go" || account.tier === "pro" || account.tier === "build"}
    >
      {children}
    </DashboardShell>
  );
}
