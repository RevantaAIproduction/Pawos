"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";
import type { WebChatSummary } from "../../lib/webChat/webChat";

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

const STORE_URL = "https://apps.microsoft.com/detail/9p6732l7486c?hl=en-US&gl=IN";

interface WorkspaceAccount {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  tierLabel: string;
  canUpgrade: boolean;
}

function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  if (url) return <Image src={url} alt="" width={size} height={size} className="shrink-0 rounded-full" unoptimized />;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300" style={{ width: size, height: size }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AccountMenu({ account }: { account: WorkspaceAccount }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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

  const item = "flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 md:min-h-0";
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition hover:bg-neutral-800/60 md:min-h-0"
      >
        <Avatar name={account.displayName} url={account.avatarUrl} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-neutral-100">{account.displayName}</span>
          <span className="block truncate text-xs leading-tight text-neutral-500">{account.tierLabel}</span>
        </span>
        <svg {...ICON} fill="currentColor" stroke="none" className="shrink-0 text-neutral-400">
          <circle cx="6" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="18" cy="12" r="1.5" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-lg border border-neutral-800 bg-[#1b1b1b] p-1.5 shadow-2xl">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium text-neutral-100">{account.displayName}</p>
            {account.email && <p className="truncate text-xs text-neutral-500">{account.email}</p>}
            {account.canUpgrade && (
              <Link href="/pricing" onClick={close} className="mt-2.5 flex items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:bg-neutral-800">
                Upgrade plan
              </Link>
            )}
          </div>
          <div className="border-t border-neutral-800 py-1">
            <Link role="menuitem" href="/dashboard" onClick={close} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />
              </svg>
              Dashboard
            </Link>
            <Link role="menuitem" href="/dashboard/settings" onClick={close} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
              </svg>
              My settings
            </Link>
          </div>
          <div className="border-t border-neutral-800 py-1">
            <Link role="menuitem" href="/dashboard/settings" onClick={close} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <circle cx="12" cy="9" r="3.5" />
                <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
              </svg>
              Public profile
            </Link>
            <a role="menuitem" href={STORE_URL} target="_blank" rel="noopener noreferrer" onClick={close} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" />
              </svg>
              Download PawOS
            </a>
            <button type="button" role="menuitem" aria-expanded={helpOpen} onClick={() => setHelpOpen((value) => !value)} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" />
              </svg>
              <span className="flex-1">Help</span>
              <svg {...ICON} width={14} height={14} className={`text-neutral-500 transition ${helpOpen ? "rotate-90" : ""}`}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {helpOpen && (
              <div className="ml-6 border-l border-neutral-800 pl-1.5">
                <Link role="menuitem" href="/docs" onClick={close} className={item}>
                  PawOS docs
                </Link>
                <Link role="menuitem" href="/help" onClick={close} className={item}>
                  Get help
                </Link>
                <Link role="menuitem" href="/support/contact" onClick={close} className={item}>
                  Contact us
                </Link>
              </div>
            )}
          </div>
          <div className="border-t border-neutral-800 pt-1">
            <button type="button" role="menuitem" onClick={signOut} className={item}>
              <svg {...ICON} className="text-neutral-400">
                <path d="M14 5H6v14h8M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />
              </svg>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV: { href: string; label: string; badge?: string; icon: ReactNode }[] = [
  {
    href: "/app",
    label: "New Chat",
    icon: (
      <svg {...ICON}>
        <path d="M4 5h16l-6.5 7.5V19l-3-1.5v-5z" />
      </svg>
    ),
  },
  {
    href: "/app/autonomous-work",
    label: "Autonomous Work",
    badge: "Desktop",
    icon: (
      <svg {...ICON}>
        <rect x="4" y="8" width="16" height="11" rx="2" />
        <path d="M12 8V4.5M9 13h.01M15 13h.01" />
      </svg>
    ),
  },
  {
    href: "/app/projects",
    label: "Projects",
    badge: "Desktop",
    icon: (
      <svg {...ICON}>
        <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </svg>
    ),
  },
];

function SidebarContents({ account, chats, onNavigate }: { account: WorkspaceAccount; chats: WebChatSummary[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeChat = useSearchParams().get("chat");

  return (
    <>
      <div className="flex items-center justify-between px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-neutral-100" aria-label="PawOS home" onClick={onNavigate}>
          <Image src="/logo-icon.png" alt="" width={20} height={20} className="rounded" />
          PawOS
        </Link>
      </div>

      <nav aria-label="Workspace" className="space-y-0.5 px-2">
        {NAV.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" && !activeChat : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition md:min-h-0 ${active ? "bg-neutral-800/80 font-medium text-white" : "text-neutral-300 hover:bg-neutral-800/50 hover:text-white"}`}
            >
              <span className="text-neutral-400">{item.icon}</span>
              {item.label}
              {item.badge && <span className="ml-1 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">{item.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="px-4 pb-1.5 text-xs text-neutral-500">Chats</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {chats.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-sm text-neutral-500">No chats yet</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((chat) => {
                const active = pathname === "/app" && activeChat === chat.id;
                return (
                  <li key={chat.id}>
                    <Link
                      href={`/app?chat=${chat.id}`}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`block truncate rounded-md px-2.5 py-2.5 text-sm transition md:py-1.5 ${active ? "bg-neutral-800/80 text-white" : "text-neutral-300 hover:bg-neutral-800/50 hover:text-white"}`}
                    >
                      {chat.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {account.canUpgrade && (
          <Link href="/pricing" onClick={onNavigate} className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800 md:min-h-0">
            <svg {...ICON}>
              <path d="M12 4l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.3zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
            </svg>
            Upgrade plan
          </Link>
        )}
        <AccountMenu account={account} />
      </div>
    </>
  );
}

/**
 * The signed-in PawOS Web workspace frame (/app): chats and navigation in a left sidebar with the
 * account at the bottom, which becomes a slide-in drawer on phones. It only renders inside the
 * signed-in /app layout; the chat list and account values come from the server.
 */
export function WorkspaceShell({ account, chats, children }: { account: WorkspaceAccount; chats: WebChatSummary[]; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // While the drawer is open: Escape closes it, and the page behind it does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-[#141414] text-neutral-100 md:flex">
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:border-r md:border-neutral-800/80 md:bg-[#181818]">
        <Suspense fallback={null}>
          <SidebarContents account={account} chats={chats} />
        </Suspense>
      </aside>

      <header className="sticky top-0 z-30 box-content flex h-14 items-center justify-between border-b border-neutral-800/80 bg-[#181818]/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <button type="button" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800">
          <svg {...ICON} width={20} height={20}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="flex items-center gap-2 text-sm font-medium">
          <Image src="/logo-icon.png" alt="" width={18} height={18} className="rounded" />
          PawOS
        </span>
        <Link href="/app" aria-label="New chat" className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800">
          <svg {...ICON} width={20} height={20}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-800 bg-[#181818] pl-[env(safe-area-inset-left)]">
            <Suspense fallback={null}>
              <SidebarContents account={account} chats={chats} onNavigate={() => setDrawerOpen(false)} />
            </Suspense>
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1 md:pl-64">{children}</div>
    </div>
  );
}
