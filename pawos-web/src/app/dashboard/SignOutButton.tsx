"use client";

import { createClient } from "../../lib/supabase/client";

export function SignOutButton() {
  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
    >
      Sign out
    </button>
  );
}
