import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { getPublicProfile, type PublicProfile } from "../../../lib/account/profile";
import { getCompanion } from "../../../lib/account/companionCatalog";
import { CompanionPreview3D } from "../../../components/dashboard/CompanionPreview3D";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ handle: string }> };

/** Null for an unknown handle and for a profile that is switched off — the page 404s for both. */
async function loadProfile(handle: string): Promise<PublicProfile | null> {
  try {
    return await getPublicProfile(await createClient(), handle);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: "Profile not found", robots: { index: false, follow: false } };
  return { title: `${profile.displayName} (@${profile.handle})`, description: profile.bio ?? `${profile.displayName} on PawOS.` };
}

/**
 * A public PawOS profile at /u/<handle>. Shows only what get_public_profile() returns — name,
 * picture, handle, bio, the owner's chosen links and their Companion. The Companion is read from
 * the same account record the dashboard writes, so a change there appears here on the next load.
 */
export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) notFound();

  const companion = getCompanion(profile.companionId);
  const companionName = companion?.displayName ?? profile.customCompanionName;

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-32">
      <div className="flex items-center gap-5">
        {profile.avatarUrl ? (
          <Image src={profile.avatarUrl} alt="" width={80} height={80} className="rounded-full" unoptimized />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-2xl font-semibold text-neutral-300" aria-hidden="true">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight text-white">{profile.displayName}</h1>
          <p className="truncate text-neutral-400">@{profile.handle}</p>
        </div>
      </div>

      {profile.bio && <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-neutral-300">{profile.bio}</p>}

      {companionName && (
        <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6" aria-label="Companion">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">PawOS Companion</h2>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
            {companion?.preview === "paw3d" && (
              <div className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
                <CompanionPreview3D label={companion.displayName} />
              </div>
            )}
            <div>
              <p className="text-xl font-medium text-white" data-testid="public-companion-name">
                {companionName}
              </p>
              <p className="mt-1 text-sm text-neutral-400">{companion ? companion.description : "A custom Companion made in the PawOS desktop app."}</p>
            </div>
          </div>
        </section>
      )}

      {profile.links.length > 0 && (
        <section className="mt-6" aria-label="Links">
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
            {profile.links.map((link) => (
              <li key={`${link.label}:${link.url}`}>
                <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-neutral-900">
                  <span className="font-medium text-neutral-100">{link.label}</span>
                  <span className="truncate text-sm text-neutral-500">{link.url.replace(/^https:\/\//, "")}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
