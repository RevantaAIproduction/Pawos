"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";
import { useSignedOutElsewhere } from "../../lib/auth/useSignedOutElsewhere";

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

type NavItem = { href: string; label: string; icon: ReactNode };

/** Grouped the way the sidebar spaces them: account pages, then integrations, spending, companion. */
const NAV_GROUPS: NavItem[][] = [
  [
    {
      href: "/dashboard",
      label: "Overview",
      icon: (
        <svg {...ICON}>
          <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />
        </svg>
      ),
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: (
        <svg {...ICON}>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
      ),
    },
  ],
  [
    {
      href: "/dashboard/integrations",
      label: "Integrations",
      icon: (
        <svg {...ICON}>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="12" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <path d="M6 8.2v7.6M8 6.6c5 .6 7.5 2 8.3 3.6" />
        </svg>
      ),
    },
  ],
  [
    {
      href: "/dashboard/spending",
      label: "Spending",
      icon: (
        <svg {...ICON}>
          <path d="M4.5 16a8 8 0 1 1 15 0" />
          <path d="M12 13l3.5-4" />
          <circle cx="12" cy="13" r="1" />
        </svg>
      ),
    },
  ],
  [
    {
      href: "/dashboard/companion",
      label: "Companion",
      icon: (
        <svg {...ICON}>
          <circle cx="12" cy="10" r="4" />
          <path d="M5 20a7 7 0 0 1 14 0M9.5 6.5 8 4M14.5 6.5 16 4" />
        </svg>
      ),
    },
  ],
];
const NAV_ITEMS = NAV_GROUPS.flat();

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(`${href}/`);
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) {
    return <Image src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" unoptimized />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface AccountProps {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  tierLabel: string;
  /** Whether a higher plan exists for this account to move to. */
  canUpgrade: boolean;
}

/** The "…" account menu. `menuPosition` is where the popover opens relative to the trigger. */
function AccountMenu({ displayName, email, tierLabel, menuPosition }: Pick<AccountProps, "displayName" | "email" | "tierLabel"> & { menuPosition: "above" | "below" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = "/";
  };

  const itemClasses = "block min-h-11 w-full rounded-md px-3 py-2.5 text-left text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white md:min-h-0 md:py-2";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white md:h-7 md:w-7"
      >
        <svg {...ICON} fill="currentColor" stroke="none">
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-50 w-56 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-2xl ${menuPosition === "above" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <div className="border-b border-neutral-800/80 px-3 py-2">
            <p className="truncate text-sm font-medium text-neutral-100">{displayName}</p>
            {email && <p className="truncate text-xs text-neutral-500">{email}</p>}
            <p className="mt-0.5 text-xs text-neutral-400">{tierLabel}</p>
          </div>
          <Link role="menuitem" href="/dashboard/settings" onClick={() => setOpen(false)} className={`${itemClasses} mt-1`}>
            Account settings
          </Link>
          <Link role="menuitem" href="/pricing" onClick={() => setOpen(false)} className={itemClasses}>
            Plans
          </Link>
          <button role="menuitem" type="button" onClick={signOut} className={itemClasses}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function BrandLink() {
  return (
    <Link href="/app" className="flex items-center gap-2 text-sm font-medium text-neutral-100 transition hover:text-white" aria-label="Back to PawOS Web">
      <svg {...ICON} width={14} height={14} className="text-neutral-500">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      <Image src="/logo-icon.png" alt="" width={20} height={20} className="rounded" />
      PawOS
    </Link>
  );
}

/**
 * The signed-in dashboard frame: a fixed left sidebar on desktop — navigation on top, the upgrade
 * button and the account row at the bottom-left — which becomes a top bar with a slide-in drawer on
 * phones and tablets (the same pattern as the /app workspace), so nothing needs sideways scrolling.
 * It only ever renders inside the signed-in /dashboard layout, and every account value shown here
 * is passed down from the server.
 */
export function DashboardShell({ children, ...account }: AccountProps & { children: ReactNode }) {
  useSignedOutElsewhere();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // While the drawer is open: Escape closes it, and the page behind it does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const button = menuButtonRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      button?.focus();
    };
  }, [drawerOpen]);

  const navLink = (item: NavItem, compact: boolean) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={compact ? () => setDrawerOpen(false) : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-md px-2.5 text-sm transition ${compact ? "min-h-11 py-2" : "py-1.5"} ${
          active ? "bg-neutral-800/80 font-medium text-white" : "text-neutral-300 hover:bg-neutral-800/50 hover:text-white"
        }`}
      >
        <span className={active ? "text-neutral-200" : "text-neutral-400"}>{item.icon}</span>
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh bg-[#141414] text-neutral-100 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:border-r md:border-neutral-800/80 md:bg-[#181818]">
        <div className="px-4 py-4">
          <BrandLink />
        </div>
        <nav aria-label="Dashboard" className="flex-1 space-y-4 px-2">
          {NAV_GROUPS.map((group, index) => (
            <div key={index} className="space-y-0.5">
              {group.map((item) => navLink(item, false))}
            </div>
          ))}
        </nav>
        <div className="space-y-2 p-3">
          {account.canUpgrade && (
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800"
            >
              <svg {...ICON}>
                <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
              </svg>
              Upgrade plan
            </Link>
          )}
          <div className="flex items-center gap-2.5 px-1 py-1">
            <Avatar name={account.displayName} url={account.avatarUrl} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight text-neutral-100">{account.displayName}</p>
              <p className="truncate text-xs leading-tight text-neutral-500">{account.tierLabel}</p>
            </div>
            <AccountMenu displayName={account.displayName} email={account.email} tierLabel={account.tierLabel} menuPosition="above" />
          </div>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-[#181818]/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800"
            >
              <svg {...ICON} width={20} height={20}>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="truncate text-sm font-medium text-neutral-100">{NAV_ITEMS.find((item) => isActive(pathname, item.href))?.label ?? "Dashboard"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Avatar name={account.displayName} url={account.avatarUrl} size={26} />
            <AccountMenu displayName={account.displayName} email={account.email} tierLabel={account.tierLabel} menuPosition="below" />
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Dashboard menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-neutral-800 bg-[#181818] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]">
            <div className="px-4 py-4">
              <BrandLink />
            </div>
            <nav aria-label="Dashboard" className="flex-1 space-y-4 px-2">
              {NAV_GROUPS.map((group, index) => (
                <div key={index} className="space-y-0.5">
                  {group.map((item) => navLink(item, true))}
                </div>
              ))}
            </nav>
            {account.canUpgrade && (
              <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Link
                  href="/pricing"
                  onClick={() => setDrawerOpen(false)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800"
                >
                  Upgrade plan
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1 md:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 md:py-10">{children}</div>
      </div>
    </div>
  );
}
