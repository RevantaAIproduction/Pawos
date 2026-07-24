import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "../../lib/supabase/server";
import { SignOutButton } from "./SignOutButton";
import { Button } from "../../components/ui/Button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

function displayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  return (
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.user_name === "string" && meta.user_name) ||
    user.email ||
    "PawOS user"
  );
}

function avatarUrl(user: { user_metadata?: Record<string, unknown> }): string | null {
  const meta = user.user_metadata ?? {};
  return (typeof meta.avatar_url === "string" && meta.avatar_url) || (typeof meta.picture === "string" && meta.picture) || null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: creditsRow }, { data: purchases }] = await Promise.all([
    supabase.from("user_task_credits").select("balance, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("task_credit_purchases")
      .select("id, credits, amount_usd, purchased_at")
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })
      .limit(10),
  ]);

  const name = displayName(user);
  const avatar = avatarUrl(user);
  const memberSince = new Date(user.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {avatar ? (
            <Image src={avatar} alt="" width={56} height={56} className="rounded-full" unoptimized />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-300">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            <p className="text-sm text-neutral-400">{user.email}</p>
          </div>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-sm font-medium text-neutral-400">Account</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">Account ID</dt>
              <dd className="font-mono text-xs text-neutral-300">{user.id}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-neutral-500">Member since</dt>
              <dd className="text-neutral-300">{memberSince}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-sm font-medium text-neutral-400">Autonomous Task Credits</h2>
          <p className="mt-3 text-3xl font-bold">{creditsRow?.balance ?? 0}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Prepaid credits for Autonomous Engineering Tasks, shared with your PawOS desktop app.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        <h2 className="text-sm font-medium text-neutral-400">Purchase history</h2>
        {purchases && purchases.length > 0 ? (
          <ul className="mt-3 divide-y divide-neutral-800 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="text-neutral-300">{p.credits} credits</span>
                <span className="text-neutral-500">${Number(p.amount_usd).toFixed(2)}</span>
                <span className="text-neutral-500">{new Date(p.purchased_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No purchases yet.</p>
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="flex-1">
          <h2 className="font-semibold">Your plan and companion live in the PawOS desktop app</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Subscription tier, companion settings, and conversations are managed there — this dashboard covers
            your account and task credits.
          </p>
        </div>
        <Button href="/download" variant="secondary">
          Download PawOS
        </Button>
        <Button href="/pricing" variant="primary">
          View plans
        </Button>
      </div>
    </div>
  );
}
