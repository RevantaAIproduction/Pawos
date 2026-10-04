import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicProfile, type PublicProfile } from "../../../../lib/account/profile";
import { getCompanion } from "../../../../lib/account/companionCatalog";

/**
 * GET /api/public-profile/<handle> — a profile its owner has made public. Looked up by handle only
 * (there is no way to ask for a profile by user id), and 404 both when the handle doesn't exist
 * and when the profile is switched off. The response is the fixed public whitelist: name, picture,
 * handle, bio, the owner's chosen links and their Companion.
 */
export async function GET(_request: Request, props: { params: Promise<{ handle: string }> }) {
  const { handle } = await props.params;
  let profile: PublicProfile | null = null;
  try {
    profile = await getPublicProfile(await createClient(), handle);
  } catch {
    profile = null;
  }
  if (!profile) {
    return NextResponse.json({ ok: false, code: "not_found", message: "Profile not found." }, { status: 404 });
  }
  const companion = getCompanion(profile.companionId);
  return NextResponse.json({
    ok: true,
    profile: {
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      links: profile.links,
      companion: companion
        ? { companionId: companion.companionId, displayName: companion.displayName, description: companion.description }
        : profile.customCompanionName
          ? { companionId: null, displayName: profile.customCompanionName, description: null }
          : null,
    },
  });
}
