import { NextResponse } from "next/server";
import { errorResponse, rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import { getMyProfile, parsePublicProfileInput, publicProfileUrl, updatePublicProfile, type AccountProfile } from "../../../../lib/account/profile";

function profilePayload(profile: AccountProfile) {
  return {
    ok: true,
    profile: {
      handle: profile.handle,
      publicProfileEnabled: profile.publicProfileEnabled,
      displayName: profile.displayName,
      bio: profile.bio,
      links: profile.links,
      publicUrl: publicProfileUrl(profile.handle),
    },
  };
}

/** GET /api/dashboard/profile — the account's own public-profile settings. */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(profilePayload(await getMyProfile(guard.account.supabase)));
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT /api/dashboard/profile { enabled, handle, displayName, bio, links } — update them. */
export async function PUT(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(profilePayload(await updatePublicProfile(guard.account.supabase, parsePublicProfileInput(body))));
  } catch (error) {
    return errorResponse(error);
  }
}
