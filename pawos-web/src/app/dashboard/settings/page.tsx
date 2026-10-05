import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "../../../lib/account/accountContext";
import { getMyProfile, publicProfileUrl, type AccountProfile } from "../../../lib/account/profile";
import { PageHeader, Panel, Row, SectionLabel, formatDate, secondaryButton } from "../../../components/dashboard/ui";
import { SignOutButton } from "../SignOutButton";
import { PublicProfileForm } from "./PublicProfileForm";
import { DeleteAccountPanel } from "./DeleteAccountPanel";

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
      <PageHeader title="Settings" />

      <div className="space-y-10">
        <section aria-label="Profile">
          <SectionLabel>Profile</SectionLabel>
          {/* The read-only account rows and the editable profile rows read as one panel. */}
          <Panel className={profile ? "rounded-b-none" : ""}>
            <Row label="Email">
              <span className="break-all text-sm text-neutral-300">{account.user.email}</span>
            </Row>
            <Row label="Profile image" hint="From the account you sign in with.">
              {account.avatarUrl ? (
                <Image src={account.avatarUrl} alt="" width={40} height={40} className="rounded-full" unoptimized />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-300" aria-hidden="true">
                  {account.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Row>
            <Row label="Name">
              <span className="text-sm text-neutral-300">{account.displayName}</span>
            </Row>
          </Panel>
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
            <p className="mt-3 px-1 text-sm text-neutral-500">Handle, links and public profile settings aren&apos;t available right now. Try again in a moment.</p>
          )}
        </section>

        <section aria-label="Account">
          <SectionLabel>Account</SectionLabel>
          <Panel>
            <Row label="Plan">
              <span className="text-sm text-neutral-300">{account.tierLabel}</span>
            </Row>
            <Row label="Member since">
              <span className="text-sm text-neutral-300">{formatDate(account.user.created_at) ?? "—"}</span>
            </Row>
            <Row label="Account ID">
              <span className="break-all font-mono text-xs text-neutral-400">{account.user.id}</span>
            </Row>
            {account.organizations.length > 0 && (
              <Row label="Organizations">
                <span className="text-sm text-neutral-300">{account.organizations.map((org) => `${org.name} (${org.role})`).join(", ")}</span>
              </Row>
            )}
          </Panel>
        </section>

        <section aria-label="Desktop app">
          <SectionLabel>Desktop app</SectionLabel>
          <Panel>
            <Row label="Appearance and privacy" hint="Theme, privacy and other app preferences are set in the PawOS desktop app, under Settings." />
          </Panel>
        </section>

        <section aria-label="More">
          <SectionLabel>More</SectionLabel>
          <Panel>
            <Row label="Password" hint="Get an email with a link to set a new password.">
              <Link href="/forgot-password" className={secondaryButton}>
                Reset password
              </Link>
            </Row>
            <Row label="Log out" hint="Ends your PawOS session in this browser.">
              <SignOutButton />
            </Row>
          </Panel>
        </section>

        {account.user.email && (
          <section aria-label="Delete account">
            <SectionLabel>Danger zone</SectionLabel>
            <DeleteAccountPanel email={account.user.email} />
          </section>
        )}
      </div>
    </>
  );
}
