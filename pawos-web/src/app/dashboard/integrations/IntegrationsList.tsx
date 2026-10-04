"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { INTEGRATION_GROUPS, type IntegrationGroup, type IntegrationState } from "../../../lib/account/integrations";
import { SectionLabel, primaryButton, secondaryButton } from "../../../components/dashboard/ui";

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Neutral category glyphs, not vendor logos. */
const GROUP_ICONS: Record<IntegrationGroup, ReactNode> = {
  sourceControl: (
    <svg {...ICON}>
      <path d="M6 3v12M18 9a9 9 0 0 1-9 9" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
    </svg>
  ),
  integrations: (
    <svg {...ICON}>
      <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" />
    </svg>
  ),
  hosting: (
    <svg {...ICON}>
      <path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18z" />
      <path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" />
    </svg>
  ),
};

const MCP_LABELS: Record<NonNullable<IntegrationState["mcp"]>, string> = {
  existingCredential: "MCP: uses this connection in the desktop app — no second sign-in.",
  mcpSignIn: "MCP: needs its own sign-in, enabled from the desktop app after connecting.",
  providerSetup: "MCP: not available yet — awaiting setup with the provider.",
};

function ArrowUpRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

type RowNotice = { kind: "info" | "error"; text: string };

function StatusBadge({ integration }: { integration: IntegrationState }) {
  if (integration.connection === "connected") {
    return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">Connected</span>;
  }
  if (integration.connection === "needsReauth") {
    return <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">Reconnect needed</span>;
  }
  if (integration.connection === "error") {
    return <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-300">Connection error</span>;
  }
  return null;
}

/**
 * The Integrations list. What each row may do is decided by the server — `entitled` and
 * `connection` arrive already resolved — and the two actions here call /api/dashboard/integrations,
 * which checks the session and entitlement again. Locking a button in this component is a
 * convenience, not the control.
 */
export function IntegrationsList({ initial }: { initial: IntegrationState[] }) {
  const router = useRouter();
  const [integrations, setIntegrations] = useState(initial);

  // Returning from a provider's consent page — often in a new tab, or via the back button on a
  // phone — must show the server's connection state, never a stale copy of this page.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("status")) {
      // The outcome message has been shown; a reload shouldn't show it again.
      url.searchParams.delete("status");
      url.searchParams.delete("integration");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  // A server refresh brings new rows; show them.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setIntegrations(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, RowNotice>>({});

  const setNotice = (id: string, notice: RowNotice | null) =>
    setNotices((current) => {
      const next = { ...current };
      if (notice) next[id] = notice;
      else delete next[id];
      return next;
    });

  const connect = async (integration: IntegrationState) => {
    if (busy) return;
    setBusy(integration.id);
    setNotice(integration.id, null);
    try {
      const response = await fetch(`/api/dashboard/integrations/${integration.id}`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; connect?: { method?: string; url?: string; message?: string } };
      if (response.ok && data.ok && data.connect?.method === "redirect" && data.connect.url) {
        // Leaves for the provider's consent page; the callback brings the browser back here.
        window.location.assign(data.connect.url);
        return;
      }
      if (response.ok && data.ok) setNotice(integration.id, { kind: "info", text: data.connect?.message ?? "Finish connecting in the PawOS desktop app." });
      else setNotice(integration.id, { kind: "error", text: data.message ?? "Could not start connecting. Please try again." });
    } catch {
      setNotice(integration.id, { kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (integration: IntegrationState) => {
    if (busy) return;
    setBusy(integration.id);
    setNotice(integration.id, null);
    try {
      const response = await fetch(`/api/dashboard/integrations/${integration.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; integration?: IntegrationState };
      if (response.ok && data.ok && data.integration) {
        const updated = data.integration;
        setIntegrations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setManaging(null);
        setNotice(integration.id, { kind: "info", text: `${integration.name} disconnected.` });
      } else {
        setNotice(integration.id, { kind: "error", text: data.message ?? "Could not disconnect. Please try again." });
      }
    } catch {
      setNotice(integration.id, { kind: "error", text: "Could not reach PawOS. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-10">
      {INTEGRATION_GROUPS.map((group) => {
        const items = integrations.filter((integration) => integration.group === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} aria-label={group.title}>
            <SectionLabel>{group.title}</SectionLabel>
            <ul className="divide-y divide-neutral-800/80 overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-900/40">
              {items.map((integration) => {
                const notice = notices[integration.id];
                const isConnected = integration.connection !== "notConnected";
                return (
                  <li key={integration.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-400">
                          {GROUP_ICONS[integration.group]}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-neutral-100">{integration.name}</h3>
                            <StatusBadge integration={integration} />
                          </div>
                          <p className="mt-0.5 text-sm text-neutral-400">{integration.description}</p>
                          {integration.mcp && <p className="mt-1 text-xs text-neutral-500">{MCP_LABELS[integration.mcp]}</p>}
                          {isConnected && integration.accountLabel && <p className="mt-1 text-xs text-neutral-500">Connected to {integration.accountLabel}</p>}
                          {!integration.entitled && integration.availableOn && (
                            <p className="mt-1 text-xs text-neutral-500">Available on a higher plan — included from {integration.availableOn}.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        {!integration.entitled ? (
                          <Link href="/pricing" className={`${secondaryButton} text-neutral-400`}>
                            Upgrade
                            <ArrowUpRight />
                          </Link>
                        ) : isConnected ? (
                          managing === integration.id ? (
                            <>
                              <button type="button" className={secondaryButton} onClick={() => setManaging(null)} disabled={busy === integration.id}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-full border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => disconnect(integration)}
                                disabled={busy === integration.id}
                              >
                                {busy === integration.id ? "Disconnecting…" : "Disconnect"}
                              </button>
                            </>
                          ) : (
                            <button type="button" className={secondaryButton} onClick={() => setManaging(integration.id)}>
                              Manage
                            </button>
                          )
                        ) : (
                          <button type="button" className={primaryButton} onClick={() => connect(integration)} disabled={busy === integration.id}>
                            {busy === integration.id ? "Checking…" : "Connect"}
                            {busy !== integration.id && <ArrowUpRight />}
                          </button>
                        )}
                      </div>
                    </div>

                    {managing === integration.id && (
                      <p className="mt-3 text-xs text-neutral-500">
                        Disconnecting removes the stored {integration.name} credential from your PawOS account, on the web and in the desktop app.
                      </p>
                    )}
                    {notice && (
                      <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${notice.kind === "error" ? "text-red-400" : "text-neutral-300"}`}>
                        {notice.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
