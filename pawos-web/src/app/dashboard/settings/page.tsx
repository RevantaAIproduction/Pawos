import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { getMyProfile, publicProfileUrl, type AccountProfile } from "../../../lib/account/profile";
import { Card, CardTitle, PageHeader, formatDate, secondaryButton } from "../../../components/dashboard/ui";
import { SignOutButton } from "../SignOutButton";
import { PublicProfileForm } from "./PublicProfileForm";

export const metadata: Metadata = { title: "Settings" };

export default async function DashboardSettingsPage() {
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
      <PageHeader title="Settings" description="Your PawOS account and public profile." />

      <div className="space-y-4">
        <Card>
          <CardTitle>Account</CardTitle>
          <div className="mt-4 flex items-center gap-4">
            {account.avatarUrl ? (
              <Image src={account.avatarUrl} alt="" width={56} height={56} className="rounded-full" unoptimized />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-300">
                {account.displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-medium text-white">{account.displayName}</p>
              <p className="truncate text-sm text-neutral-400">{account.user.email}</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Plan</dt>
              <dd className="mt-0.5 text-neutral-200">{account.tierLabel}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Member since</dt>
              <dd className="mt-0.5 text-neutral-200">{formatDate(account.user.created_at) ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Account ID</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-neutral-300">{account.user.id}</dd>
            </div>
            {account.organizations.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-neutral-500">Organizations</dt>
                <dd className="mt-0.5 text-neutral-200">{account.organizations.map((org) => `${org.name} (${org.role})`).join(", ")}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <CardTitle>Public profile</CardTitle>
          <div className="mt-4">
            {profile ? (
              <PublicProfileForm
                initial={{
                  handle: profile.handle,
                  publicProfileEnabled: profile.publicProfileEnabled,
                  displayName: profile.displayName,
                  bio: profile.bio,
                  links: profile.links,
                  publicUrl: publicProfileUrl(profile.handle),
                }}
              />
            ) : (
              <p className="text-sm text-neutral-400">Public profile settings aren&apos;t available right now. Try again in a moment.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Sign-in and session</CardTitle>
          <p className="mt-3 text-sm text-neutral-400">Sign out of PawOS on this browser, or reset your password by email.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SignOutButton />
            <Link href="/forgot-password" className={secondaryButton}>
              Reset password
            </Link>
          </div>
        </Card>

        <Card>
          <CardTitle>Desktop app settings</CardTitle>
          <p className="mt-3 text-sm text-neutral-400">
            Appearance, privacy and other app preferences are managed in the PawOS desktop app under Settings. They aren&apos;t duplicated here.
          </p>
        </Card>
      </div>
    </>
  );
}
