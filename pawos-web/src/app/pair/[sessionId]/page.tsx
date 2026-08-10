import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { PairClient } from "./PairClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pair this device",
  robots: { index: false, follow: false },
};

/**
 * Phone-side half of the Pairing Runtime (MOB-5) — opened by scanning the
 * desktop's QR code. Requires sign-in (the same account the desktop app is
 * signed into) before it will call complete_pairing_session, matching the
 * RPC's own auth.uid() ownership check.
 */
export default async function PairPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { sessionId } = await params;
  const { token } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/pair/${sessionId}${token ? `?token=${token}` : ""}`);
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold">Pairing link is missing its code</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This link is incomplete — scan the QR code from your desktop again rather than typing the
          URL by hand.
        </p>
      </div>
    );
  }

  return <PairClient sessionId={sessionId} token={token} userEmail={user.email ?? null} />;
}
