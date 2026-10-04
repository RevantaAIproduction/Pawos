"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";

const ICON = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const NAV_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg {...ICON}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg {...ICON}>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/integrations",
    label: "Integrations",
    icon: (
      <svg {...ICON}>
        <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/spending",
    label: "Spending",
    icon: (
      <svg {...ICON}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/companion",
    label: "Companion",
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="9" r="4" />
        <path d="M5 20a7 7 0 0 1 14 0M9.5 5.5 8 3M14.5 5.5 16 3" />
      </svg>
    ),
  },
];

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
      className="flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-300"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AccountMenu({ displayName, email, avatarUrl, tierLabel, placement }: AccountProps & { placement: "top" | "bottom" }) {
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

  const compact = placement === "bottom";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? "Account menu" : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-3 rounded-lg text-left transition hover:bg-neutral-900 ${compact ? "p-1" : "w-full px-2 py-2"}`}
      >
        <Avatar name={displayName} url={avatarUrl} size={32} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-100">{displayName}</span>
            <span className="block truncate text-xs text-neutral-500">{tierLabel}</span>
          </span>
        )}
        {!compact && (
          <svg {...ICON} width={16} height={16} className="shrink-0 text-neutral-500">
            <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-60 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-2xl ${
            compact ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2"
          }`}
        >
          <div className="border-b border-neutral-900 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-neutral-100">{displayName}</p>
            {email && <p className="truncate text-xs text-neutral-500">{email}</p>}
            <p className="mt-1 text-xs text-neutral-400">{tierLabel}</p>
          </div>
          <Link role="menuitem" href="/dashboard/settings" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white">
            Account settings
          </Link>
          <Link role="menuitem" href="/pricing" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white">
            Plans
          </Link>
          <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white">
            PawOS home
          </Link>
          <button role="menuitem" type="button" onClick={signOut} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface AccountProps {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  tierLabel: string;
}

/**
 * The signed-in dashboard frame: a fixed left sidebar on desktop (navigation on top, account at
 * the bottom-left), which reflows into a top bar with a scrollable tab row on small screens. The
 * account values shown here are passed down from the server layout, never read from the browser.
 */
export function DashboardShell({ children, ...account }: AccountProps & { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-black text-neutral-100 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col md:border-r md:border-neutral-900 md:bg-neutral-950">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5 text-base font-semibold tracking-tight text-white" aria-label="PawOS dashboard">
          <Image src="/logo-icon.png" alt="" width={24} height={24} className="rounded-md" />
          PawOS
        </Link>
        <nav aria-label="Dashboard" className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-neutral-900 font-medium text-white" : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-100"
                }`}
              >
                <span className={active ? "text-neutral-200" : "text-neutral-500"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-900 p-3">
          <AccountMenu {...account} placement="top" />
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-40 border-b border-neutral-900 bg-neutral-950/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white" aria-label="PawOS dashboard">
            <Image src="/logo-icon.png" alt="" width={24} height={24} className="rounded-md" />
            PawOS
          </Link>
          <AccountMenu {...account} placement="bottom" />
        </div>
        <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  active ? "bg-neutral-900 font-medium text-white" : "text-neutral-400 hover:text-neutral-100"
                }`}
              >
                <span className={active ? "text-neutral-200" : "text-neutral-500"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="min-w-0 flex-1 md:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 md:py-12">{children}</div>
      </div>
    </div>
  );
}
