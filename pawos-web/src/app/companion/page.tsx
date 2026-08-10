import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { SignOutButton } from "../dashboard/SignOutButton";
import { CompanionPresence } from "./CompanionPresence";
import { CompanionNotifications } from "./CompanionNotifications";
import { CompanionConversationSync } from "./CompanionConversationSync";
import { CompanionApprovalCenter } from "./CompanionApprovalCenter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companion",
  description: "PawOS on your phone — notifications, approvals, and a live conversation preview.",
  robots: { index: false, follow: false },
};

/**
 * Mobile Presence's Mobile Client (PWA Foundation, MOB-4) — the installable
 * app shell / manifest start_url. Pairing (MOB-5), live device presence
 * (MOB-6, via <CompanionPresence>), push notifications (MOB-7, via
 * <CompanionNotifications>), a live conversation preview (MOB-8, via
 * <CompanionConversationSync>), and the Approval Center (MOB-9, via
 * <CompanionApprovalCenter>) are all real as of this page. Per the product
 * requirement "unsupported mobile features are not exposed until fully
 * implemented," this page shows only what is real right now.
 */
export default async function CompanionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/companion");
  }

  return (
    <div className="pawos-safe-area-top pawos-safe-area-bottom pawos-safe-area-x mx-auto max-w-md px-6 py-12">
      <CompanionPresence userId={user.id} />
      <h1 className="text-2xl font-bold">PawOS Companion</h1>
      <p className="mt-2 text-sm text-neutral-400">Signed in as {user.email}</p>

      <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="font-semibold">This device is ready</h2>
        <p className="mt-2 text-sm text-neutral-400">
          You&apos;ve installed PawOS on this device. To pair it, open Trusted Devices on your desktop
          app and scan the QR code it generates — once paired, this device stays visible to your
          desktop in real time and shows a live preview of your conversation. Replying from here is
          arriving in an upcoming update.
        </p>
      </div>

      <CompanionApprovalCenter userId={user.id} />
      <CompanionConversationSync userId={user.id} />
      <CompanionNotifications />

      <div className="mt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
