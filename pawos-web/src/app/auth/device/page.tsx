import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../../components/auth/AuthLayout";
import { DEVICE_CLIENT_LABELS, isChallenge, isDeviceClient } from "../../../lib/auth/deviceAuth";
import { createClient } from "../../../lib/supabase/server";
import { DeviceAuthorize } from "./DeviceAuthorize";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in to a PawOS client",
  robots: { index: false, follow: false },
};

/**
 * /auth/device?challenge=…&client=cli|vscode — where the PawOS CLI and the VS Code extension send
 * the browser to sign in (see lib/auth/deviceAuth.ts). A signed-out browser goes through the
 * normal /login first (Google, GitHub or email) and comes back here; a signed-in one confirms and
 * is shown a one-time code to paste into the client.
 */
export default async function DeviceAuthPage({ searchParams }: { searchParams: Promise<{ challenge?: string; client?: string }> }) {
  const params = await searchParams;
  const request = isChallenge(params.challenge) && isDeviceClient(params.client) ? { challenge: params.challenge, client: params.client } : null;

  let email: string | null = null;
  let signedIn = false;
  try {
    const user = (await (await createClient()).auth.getUser()).data.user;
    signedIn = Boolean(user);
    email = user?.email ?? null;
  } catch {
    signedIn = false;
  }
  if (request && !signedIn) {
    redirect(`/login?next=${encodeURIComponent(`/auth/device?challenge=${request.challenge}&client=${request.client}`)}`);
  }

  return (
    <AuthLayout footer="none">
      {request ? (
        <DeviceAuthorize challenge={request.challenge} client={request.client} clientLabel={DEVICE_CLIENT_LABELS[request.client]} email={email} />
      ) : (
        <div data-testid="device-auth-invalid">
          <h1 className="text-2xl font-semibold tracking-tight text-white">This sign-in link isn&apos;t valid</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">Start sign-in again from the PawOS CLI or the PawOS VS Code extension.</p>
        </div>
      )}
    </AuthLayout>
  );
}
