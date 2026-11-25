"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { isAuthPagePath } from "../auth/AuthLayout";
import { trackEvent } from "../analytics/Analytics";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; links: NavLink[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Product",
    links: [
      { href: "/", label: "Overview" },
      { href: "/features/desktop-ai", label: "Desktop" },
      { href: "/docs/getting-started/four-ways-to-work#install-cli", label: "CLI" },
      { href: "/docs/getting-started/web-and-mobile", label: "Web" },
      { href: "/docs/autonomous-work/overview", label: "Autonomous Work" },
      { href: "/docs/connectors/overview", label: "Connections" },
    ],
  },
  {
    label: "Solutions",
    links: [
      { href: "/pricing#individual-plans", label: "Individual Developers" },
      { href: "/enterprise", label: "Engineering Teams" },
      { href: "/features/autonomous-engineering", label: "Engineering Workflows" },
    ],
  },
  {
    label: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/getting-started/four-ways-to-work#install-cli", label: "Install the CLI" },
      { href: "/docs/getting-started/four-ways-to-work", label: "Choose your workflow" },
      { href: "/docs/connectors/overview", label: "Integrations" },
      { href: "/docs/coding/overview", label: "Coding & validation guides" },
    ],
  },
  {
    label: "Resources",
    links: [
      { href: "/about", label: "About PawOS" },
      { href: "/changelog", label: "Changelog" },
      { href: "/faq", label: "FAQ" },
      { href: "/docs", label: "Documentation" },
      { href: "/support/contact", label: "Support & contact" },
      { href: "/careers", label: "Careers" },
    ],
  },
];

const SEARCH_INDEX = [
  { title: "PawOS Home", url: "/", type: "Page", desc: "Understand PawOS engineering workflows across Web, CLI and Desktop." },
  { title: "Product overview", url: "/", type: "Page", desc: "Explore PawOS Desktop, CLI, Web and real product workflows." },
  { title: "Desktop", url: "/features/desktop-ai", type: "Product", desc: "Windows local development workflows and availability." },
  { title: "CLI guide", url: "/docs/getting-started/four-ways-to-work", type: "Documentation", desc: "Compare Web, Desktop and CLI workflows." },
  { title: "Web", url: "/docs/getting-started/web-and-mobile", type: "Documentation", desc: "Browser Chat and GitHub-connected Code workflows." },
  { title: "About PawOS", url: "/about", type: "Page", desc: "Why PawOS exists and what it is being built to do." },
  { title: "Careers", url: "/careers", type: "Page", desc: "Explore opportunities at Revanta AI." },
  { title: "Contact", url: "/support/contact", type: "Page", desc: "Contact the PawOS team for help or business questions." },
  { title: "Documentation", url: "/docs", type: "Resource", desc: "Install, configure and use PawOS." },
  { title: "Integrations", url: "/docs/connectors/overview", type: "Resource", desc: "See supported PawOS service connections." },
  { title: "Pricing", url: "/pricing", type: "Page", desc: "Compare PawOS plans, usage and billing." },
  { title: "Changelog", url: "/changelog", type: "Resource", desc: "See PawOS product updates." },
];

function linkPath(href: string) {
  return href.split("#", 1)[0] || "/";
}

function isCurrentLink(href: string, pathname: string) {
  const path = linkPath(href);
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Nav({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname() ?? "/";
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
        setSearchOpen(false);
        setMobileOpen(false);
        setMobileGroup(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (pathname.startsWith("/docs") || pathname.startsWith("/dashboard") || pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/chronicle")) return null;
  if (pathname === "/companion" || pathname === "/auth/desktop-success" || isAuthPagePath(pathname)) return null;

  const searchResults = activeSearchQuery
    ? SEARCH_INDEX.filter((item) => `${item.title} ${item.desc} ${item.type}`.toLowerCase().includes(activeSearchQuery.toLowerCase()))
    : [];

  const closeMenus = () => {
    setActiveMenu(null);
    setSearchOpen(false);
    setMobileOpen(false);
    setMobileGroup(null);
  };

  const runSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveSearchQuery(trimmed);
    setSearchQuery(trimmed);
    const next = [trimmed, ...recentSearches.filter((term) => term !== trimmed)].slice(0, 5);
    setRecentSearches(next);
    try {
      localStorage.setItem("pawos_recent_searches", JSON.stringify(next));
    } catch {
      // Search remains available if browser storage is disabled.
    }
  };

  const openSearch = () => {
    if (!searchOpen) {
      try {
        const stored = localStorage.getItem("pawos_recent_searches");
        if (stored) setRecentSearches(JSON.parse(stored) as string[]);
      } catch {
        setRecentSearches([]);
      }
    }
    setSearchOpen((open) => !open);
    setActiveMenu(null);
  };

  const accountHref = userEmail ? "/app" : "/login";

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50"
      onMouseLeave={() => setActiveMenu(null)}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) setActiveMenu(null);
      }}
    >
      {(activeMenu || searchOpen) && (
        <button type="button" aria-label="Close navigation panel" className="fixed inset-0 top-[76px] -z-10 cursor-default bg-black/65 backdrop-blur-sm" onClick={closeMenus} />
      )}
      <header className={`relative border-b border-white/10 transition-colors ${activeMenu || searchOpen ? "bg-black" : "bg-black/75 backdrop-blur-md"}`}>
        <nav aria-label="Main navigation" className="mx-auto flex min-h-[76px] max-w-[1500px] items-center justify-between gap-5 px-4 md:px-6 xl:px-10">
          <div className="flex min-w-0 items-center gap-6 xl:gap-10">
            <Link href="/" onClick={closeMenus} className="flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-white" aria-label="PawOS home">
              <Image src="/logo-icon.png" alt="" width={28} height={28} className="rounded-md" priority />
              PawOS
            </Link>
            <div className="hidden items-center lg:flex">
              {NAV_GROUPS.map((group) => {
                const current = group.links.some((item) => isCurrentLink(item.href, pathname));
                const open = activeMenu === group.label;
                const panelId = `nav-panel-${group.label.toLowerCase()}`;
                return (
                  <button
                    key={group.label}
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onMouseEnter={() => { setActiveMenu(group.label); setSearchOpen(false); }}
                    onFocus={() => { setActiveMenu(group.label); setSearchOpen(false); }}
                    onClick={() => setActiveMenu(open ? null : group.label)}
                    className={`rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 ${open || current ? "text-white" : "text-neutral-400 hover:text-white"}`}
                  >
                    {group.label}
                  </button>
                );
              })}
              <Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined} onClick={closeMenus} className={`rounded-md px-3 py-2 text-sm transition-colors ${pathname === "/pricing" ? "text-white" : "text-neutral-400 hover:text-white"}`}>
                Pricing
              </Link>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-4 lg:flex">
            <ThemeToggle />
            <button type="button" onClick={openSearch} aria-label={searchOpen ? "Close search" : "Search PawOS"} aria-expanded={searchOpen} className="rounded-md p-2 text-neutral-400 transition hover:text-white">
              {searchOpen ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.4-4.4" /></svg>}
            </button>
            <Link href={accountHref} onClick={closeMenus} className="text-sm font-medium text-neutral-300 transition hover:text-white">{userEmail ? "Open PawOS" : "Log in"}</Link>
            <Link href="/signup" onClick={() => { closeMenus(); trackEvent("navbar_get_started", { destination: "/signup" }); }} className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200" aria-label="Get started with PawOS">
              Get Started
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button type="button" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen((open) => !open); setMobileGroup(null); }} className="rounded-md p-2 text-white hover:bg-white/10">
              {mobileOpen ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
            </button>
          </div>
        </nav>

        <div className={`hidden overflow-hidden border-t border-white/10 bg-black transition-[max-height,opacity] duration-200 lg:block ${activeMenu ? "max-h-[520px] opacity-100" : "pointer-events-none max-h-0 border-transparent opacity-0"}`}>
          {NAV_GROUPS.map((group) => {
            const panelId = `nav-panel-${group.label.toLowerCase()}`;
            return (
              <div key={group.label} id={panelId} aria-label={`${group.label} links`} hidden={activeMenu !== group.label} className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_18rem] gap-12 px-8 py-10">
                <div className="grid grid-cols-2 gap-x-10 gap-y-5">
                  {group.links.map((item) => {
                    const current = isCurrentLink(item.href, pathname);
                    return <Link key={item.label} href={item.href} aria-current={current ? "page" : undefined} onClick={() => { closeMenus(); if (item.label === "CLI Installation" || (group.label === "Product" && item.label === "CLI")) trackEvent("cli_installation_click", { source: "navbar" }); }} className={`rounded-lg px-3 py-2 text-base font-medium transition ${current ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"}`}>{item.label}</Link>;
                  })}
                </div>
                <p className="border-l border-white/10 pl-8 text-sm leading-relaxed text-neutral-400">{group.label === "Product" ? "Choose the PawOS experience that fits where your work is happening." : group.label === "Solutions" ? "Find a practical starting point for individual work, team collaboration or engineering tasks." : group.label === "Developers" ? "Get installation guidance, integration details and technical documentation." : "Learn about the company, product updates and ways to get in touch."}</p>
              </div>
            );
          })}
        </div>

        {searchOpen && (
          <section aria-label="PawOS search" className="absolute left-0 right-0 border-t border-white/10 bg-black px-5 py-8 shadow-2xl sm:px-8">
            <div className="mx-auto max-w-3xl">
              <form onSubmit={(event) => { event.preventDefault(); runSearch(searchQuery); }}>
                <label htmlFor="pawos-site-search" className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-500">Search PawOS</label>
                <div className="flex gap-3 border-b border-neutral-700 pb-3">
                  <input id="pawos-site-search" autoFocus value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); if (!event.target.value) setActiveSearchQuery(""); }} className="min-w-0 flex-1 bg-transparent text-xl text-white outline-none placeholder:text-neutral-600" placeholder="Search product, docs, pricing…" />
                  <button type="submit" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">Search</button>
                </div>
              </form>
              {!activeSearchQuery && recentSearches.length > 0 && <div className="mt-5 flex flex-wrap gap-2"><span className="w-full text-xs text-neutral-500">Recent searches</span>{recentSearches.map((term) => <button key={term} type="button" onClick={() => runSearch(term)} className="rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-600">{term}</button>)}</div>}
              {activeSearchQuery && <div className="mt-6 space-y-3">{searchResults.length ? searchResults.map((result) => <Link key={result.url} href={result.url} onClick={closeMenus} className="block rounded-lg p-3 hover:bg-white/5"><span className="text-xs uppercase tracking-wide text-neutral-500">{result.type}</span><span className="mt-1 block font-medium text-white">{result.title}</span><span className="mt-1 block text-sm text-neutral-400">{result.desc}</span></Link>) : <p className="text-sm text-neutral-400">No results found.</p>}</div>}
            </div>
          </section>
        )}

        {mobileOpen && (
          <div className="fixed inset-x-0 bottom-0 top-[76px] z-40 overflow-y-auto border-t border-white/10 bg-black px-5 pb-10 pt-4 lg:hidden">
            <div className="mx-auto max-w-xl divide-y divide-white/10">
              {NAV_GROUPS.map((group) => {
                const open = mobileGroup === group.label;
                return <section key={group.label} className="py-2">
                  <button type="button" aria-expanded={open} aria-controls={`mobile-group-${group.label.toLowerCase()}`} onClick={() => setMobileGroup(open ? null : group.label)} className="flex w-full items-center justify-between py-3 text-left text-lg font-medium text-white">
                    {group.label}<span aria-hidden="true" className={`text-neutral-500 transition-transform ${open ? "rotate-45" : ""}`}>+</span>
                  </button>
                  {open && <ul id={`mobile-group-${group.label.toLowerCase()}`} className="grid gap-1 pb-3 pl-3">{group.links.map((item) => {
                    const current = isCurrentLink(item.href, pathname);
                    return <li key={item.label}><Link href={item.href} aria-current={current ? "page" : undefined} onClick={() => { closeMenus(); if (item.label === "CLI Installation" || (group.label === "Product" && item.label === "CLI")) trackEvent("cli_installation_click", { source: "mobile_nav" }); }} className={`block rounded-lg px-3 py-2.5 text-base ${current ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5"}`}>{item.label}</Link></li>;
                  })}</ul>}
                </section>;
              })}
              <Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : undefined} onClick={closeMenus} className="block py-4 text-lg font-medium text-white">Pricing</Link>
              <div className="flex flex-col gap-3 border-t border-white/10 py-5">
                <Link href={accountHref} onClick={closeMenus} className="rounded-full border border-white/20 px-5 py-3 text-center font-medium text-white">{userEmail ? "Open PawOS" : "Log in"}</Link>
                <Link href="/signup" onClick={() => { closeMenus(); trackEvent("navbar_get_started", { destination: "/signup", source: "mobile_nav" }); }} className="rounded-full bg-white px-5 py-3 text-center font-semibold text-black">Get Started</Link>
              </div>
              <button type="button" onClick={() => { closeMenus(); openSearch(); }} className="py-4 text-left text-neutral-400">Search PawOS</button>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
