import type { Metadata } from "next";
import { AuthLayout } from "../../../../components/auth/AuthLayout";

export const metadata: Metadata = {
  title: "Return to PawOS",
  robots: { index: false, follow: false },
  // The address of this page carries a one-time handoff: never pass it on to another site.
  referrer: "no-referrer",
};

/**
 * /auth/device/complete?handoff=… — the address PawOS shows after Authorize, for the user to paste
 * into the PawOS client that started the sign-in. Nothing happens when it is opened in a browser:
 * this page neither reads nor uses the handoff. It only tells the user what the address is for.
 */
export default function DeviceAuthCompletePage() {
  return (
    <AuthLayout footer="none">
      <div data-testid="device-auth-complete">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Paste this address into PawOS</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          This address finishes signing in a PawOS client such as the PawOS CLI. Copy it from your browser&apos;s address bar and paste it where PawOS is asking for the authentication URL.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">It works once and expires a few minutes after it was created. Opening it here does nothing.</p>
      </div>
    </AuthLayout>
  );
}
