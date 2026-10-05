"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { Panel, Row, SectionLabel, primaryButton } from "../../../components/dashboard/ui";

/**
 * Team / Enterprise on PawOS Web. Organization admins (owner / billing administrators) give the
 * Paw Compute they bought to members; members see what they were given. The database does the move
 * and every check (supabase migration 20261005010000_org_give_paw_compute.sql).
 */

type Member = { user_id: string | null; email: string; display_name: string | null; status: string };
type Gift = { id: string; given_by: string; given_to: string; pc: number; note: string | null; created_at: string };

const pcText = (value: number) => `${value.toLocaleString("en-US")} PC`;
const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const inputClass = "w-full rounded-lg border border-neutral-700 bg-transparent px-3 py-2 text-base text-neutral-100 outline-none focus:border-neutral-400 md:text-sm";

export function OrgPawCompute({ organizationId, organizationName, isAdmin, userId }: { organizationId: string; organizationName: string; isAdmin: boolean; userId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [givable, setGivable] = useState<number | null>(null);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [memberRows, giftRows, left] = await Promise.all([
      supabase.from("organization_members").select("user_id, email, display_name, status").eq("organization_id", organizationId),
      supabase
        .from("organization_paw_compute_gifts")
        .select("id, given_by, given_to, pc, note, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      isAdmin ? supabase.rpc("get_my_givable_paw_compute") : Promise.resolve({ data: null, error: null }),
    ]);
    setMembers((memberRows.data ?? []) as Member[]);
    setGifts((giftRows.data ?? []) as Gift[]);
    setGivable(typeof left.data === "number" ? left.data : isAdmin ? 0 : null);
  }, [organizationId, isAdmin]);

  useEffect(() => {
    // Loads once on mount; state updates happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const name = (id: string) => {
    const member = members.find((m) => m.user_id === id);
    return member ? member.display_name || member.email : "A former member";
  };
  const recipients = useMemo(() => members.filter((m) => m.status === "active" && m.user_id && m.user_id !== userId), [members, userId]);
  const pc = Math.floor(Number(amount));
  const canGive = isAdmin && !!memberId && Number.isFinite(pc) && pc > 0 && givable !== null && pc <= givable && !busy;

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGive) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const { data, error: rpcError } = await createClient().rpc("give_paw_compute", {
      p_organization_id: organizationId,
      p_member_user_id: memberId,
      p_pc: pc,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "Paw Compute couldn't be given. Please try again.");
      return;
    }
    setDone(`Gave ${pcText(pc)} to ${name(memberId)}.`);
    setNote("");
    setGivable(typeof (data as { givable_left?: number } | null)?.givable_left === "number" ? (data as { givable_left: number }).givable_left : givable);
    void load();
  };

  const mine = gifts.filter((gift) => gift.given_to === userId);
  const shown = isAdmin ? gifts : mine;
  if (!isAdmin && mine.length === 0) return null;

  return (
    <section aria-label="Paw Compute from your organization" data-testid="org-paw-compute">
      <SectionLabel>{isAdmin ? "Give Paw Compute to members" : "Given to you by your organization"}</SectionLabel>
      <Panel>
        {isAdmin && (
          <>
            <Row
              label={<span data-testid="givable-pc">{givable === null ? "…" : pcText(givable)}</span>}
              hint={`Paw Compute you bought that you can give to members of ${organizationName}. Buy more in PawOS Desktop → Settings → Billing.`}
            />
            {recipients.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-500 sm:px-5">Members appear here once they&apos;ve joined {organizationName}.</p>
            ) : (
              <form onSubmit={give} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_140px] sm:px-5">
                <label className="grid gap-1.5 text-sm text-neutral-400 sm:col-span-2">
                  Member
                  <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)} data-testid="give-member">
                    <option value="">Choose a member</option>
                    {recipients.map((m) => (
                      <option key={m.user_id} value={m.user_id ?? ""}>
                        {m.display_name ? `${m.display_name} (${m.email})` : m.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-neutral-400">
                  Note (optional)
                  <input className={inputClass} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. For the release week" />
                </label>
                <label className="grid gap-1.5 text-sm text-neutral-400">
                  Amount (PC)
                  <input className={inputClass} type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="give-amount" />
                </label>
                {givable !== null && pc > givable && <p className="text-sm text-amber-300 sm:col-span-2">That&apos;s more than you have to give.</p>}
                {error && <p className="text-sm text-red-400 sm:col-span-2" role="alert">{error}</p>}
                {done && <p className="text-sm text-emerald-400 sm:col-span-2">{done}</p>}
                <div className="sm:col-span-2">
                  <button type="submit" disabled={!canGive} className={`${primaryButton} disabled:opacity-50`}>
                    {busy ? "Giving…" : "Give Paw Compute"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {shown.length === 0 ? (
          <p className="px-4 py-3 text-sm text-neutral-500 sm:px-5">Nothing given yet.</p>
        ) : (
          shown.map((gift) => (
            <div key={gift.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-neutral-800 px-4 py-3 text-sm sm:px-5">
              <span className="min-w-0 text-neutral-300">
                {isAdmin ? <span className="font-medium text-neutral-100">{name(gift.given_to)}</span> : <>from {name(gift.given_by)}</>}
                <span className="text-neutral-500">
                  {" "}
                  · {when(gift.created_at)}
                  {gift.note ? ` · ${gift.note}` : ""}
                </span>
              </span>
              <span className="font-medium text-neutral-100">{pcText(gift.pc)}</span>
            </div>
          ))
        )}
      </Panel>
    </section>
  );
}
