import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { desktopSignInPath, isValidChallenge } from "../../../lib/desktopSignIn";

export const metadata: Metadata = {
  title: "Sign in to PawOS Desktop",
  robots: { index: false, follow: false },
};

/**
 * Opened by PawOS Desktop's "Continue with browser". Signed out → log in or sign up first, then back
 * here. Signed in → confirm the account; the app is then signed in to the same one
 * (see lib/desktopSignIn.ts).
 */
export default async function DesktopSignInPage({ searchParams }: { searchParams: Promise<{ challenge?: string | string[] }> }) {
  const { challenge } = await searchParams;

  if (!isValidChallenge(challenge)) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight text-white">This link has expired</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Go back to PawOS Desktop and choose <span className="text-neutral-200">Continue with browser</span> again.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(desktopSignInPath(challenge))}`);

  const name = (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || user.email || "your account";

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in to PawOS Desktop</h1>
      <p className="text-2xl font-semibold tracking-tight text-neutral-500">with your PawOS account</p>

      <div className="mt-8 rounded-lg border border-neutral-800 px-4 py-3" data-testid="desktop-account">
        <p className="truncate text-sm font-medium text-neutral-100">{name}</p>
        {user.email && name !== user.email && <p className="truncate text-sm text-neutral-400">{user.email}</p>}
      </div>

      <form method="post" action="/api/auth/desktop/start" className="mt-4">
        <input type="hidden" name="challenge" value={challenge} />
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center rounded-lg bg-neutral-800 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          Continue to PawOS Desktop
        </button>
      </form>
      <form method="post" action="/api/auth/desktop/switch" className="mt-3">
        <input type="hidden" name="challenge" value={challenge} />
        <button type="submit" className="flex h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-neutral-400 transition hover:bg-neutral-900 hover:text-white">
          Use a different account
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        Only continue if you just chose &ldquo;Continue with browser&rdquo; in PawOS Desktop on this computer. PawOS Desktop and
        PawOS Web then use the same account, and signing out of one signs you out of both.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[calc(100dvh-140px)] w-full max-w-[440px] flex-col justify-center px-4 py-16">{children}</div>;
}
