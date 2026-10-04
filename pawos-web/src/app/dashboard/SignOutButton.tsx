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
      className="inline-flex items-center justify-center rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800"
    >
      Log out
    </button>
  );
}
