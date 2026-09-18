"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  {
    label: "Product",
    dropdown: [
      {
        title: "Explore PawOS",
        links: [
          { href: "/companion", label: "Companion" },
          { href: "/features#autonomous-work", label: "Autonomous Work" },
          { href: "/features#connections", label: "Connections" },
          { href: "/features#projects", label: "Projects" },
        ],
      }
    ],
  },
  {
    label: "Solutions",
    dropdown: [
      {
        title: "For every scale",
        links: [
          { href: "/pricing#individuals", label: "Individuals" },
          { href: "/enterprise", label: "Teams" },
          { href: "/enterprise", label: "Organizations" },
          { href: "/pricing", label: "Pricing" },
        ],
      }
    ],
  },
  {
    label: "Developers",
    dropdown: [
      {
        title: "Build & Integrate",
        links: [
          { href: "/docs", label: "Documentation" },
          { href: "/docs/integrations", label: "Integrations" },
          { href: "/docs/integrations/github", label: "GitHub" },
          { href: "/docs/integrations/jira", label: "Jira" },
          { href: "/docs/integrations/linear", label: "Linear" },
        ],
      }
    ],
  },
  {
    label: "Resources",
    dropdown: [
      {
        title: "Learn & Track",
        links: [
          { href: "/faq", label: "FAQ" },
          { href: "/changelog", label: "Changelog" },
          { href: "/roadmap", label: "Roadmap" },
          { href: "/trust", label: "Trust" },
        ],
      }
    ],
  },
  {
    label: "Company",
    dropdown: [
      {
        title: "Revanta AI",
        links: [
          { href: "/about", label: "About" },
          { href: "/careers", label: "Careers" },
          
          { href: "/support/contact", label: "Contact" },
          { href: "/about", label: "Revanta AI" },
        ],
      }
    ],
  },
];


const SEARCH_INDEX = [
  { title: "PawOS Home", url: "/", type: "Page", desc: "The AI companion that gets work done." },
  { title: "About Revanta AI", url: "/about", type: "Page", desc: "The story of PawOS, why it exists, and how it works." },
  { title: "Careers", url: "/careers", type: "Page", desc: "Join Revanta AI. Engineering philosophy and open roles." },
  { title: "Contact Support", url: "/support/contact", type: "Page", desc: "Reach the Revanta AI team for support, technical questions, or sales." },
  { title: "Documentation", url: "/docs", type: "Resource", desc: "Learn how to install, configure, and use PawOS in your local environment." },
  { title: "Integrations Overview", url: "/docs/integrations", type: "Resource", desc: "View the list of natively supported integrations." },
  { title: "GitHub Integration", url: "/docs/integrations/github", type: "Plugin", desc: "Connect PawOS to GitHub to manage pull requests, issues, and repositories." },
  { title: "Jira Integration", url: "/docs/integrations/jira", type: "Plugin", desc: "Manage Jira tickets, sprints, and agile workflows through PawOS." },
  { title: "Linear Integration", url: "/docs/integrations/linear", type: "Plugin", desc: "Sync issues and project tracking with Linear." },
  { title: "FAQ", url: "/faq", type: "Resource", desc: "Frequently asked questions about PawOS and Revanta AI." },
  { title: "Changelog", url: "/changelog", type: "Resource", desc: "Latest updates, features, and fixes for PawOS." },
  { title: "Roadmap", url: "/roadmap", type: "Resource", desc: "Upcoming features and the long-term vision for PawOS." },
  { title: "Trust & Security", url: "/trust", type: "Page", desc: "Learn about how PawOS handles your data safely and securely." },
  { title: "Linux Download (AppImage)", url: "https://revantaai.com/downloads/pawos-linux.AppImage", type: "Download", desc: "Download the AppImage for Linux users to experience the PawOS desktop environment." }
];

export function Nav({ userEmail }: { userEmail: string | null }) {

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pawos_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const executeSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setActiveSearchQuery(trimmed);
    setSearchQuery(trimmed);
    
    const newRecents = [trimmed, ...recentSearches.filter(t => t !== trimmed)].slice(0, 5);
    setRecentSearches(newRecents);
    try {
      localStorage.setItem("pawos_recent_searches", JSON.stringify(newRecents));
    } catch (e) {}
  };

  const handleRemoveRecent = (term: string) => {
    const newRecents = recentSearches.filter(t => t !== term);
    setRecentSearches(newRecents);
    try {
      localStorage.setItem("pawos_recent_searches", JSON.stringify(newRecents));
    } catch (e) {}
  };

  const searchResults = activeSearchQuery 
    ? SEARCH_INDEX.filter(item => 
        item.title.toLowerCase().includes(activeSearchQuery.toLowerCase()) || 
        item.desc.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
        item.type.toLowerCase().includes(activeSearchQuery.toLowerCase())
      )
    : [];
  const pathname = usePathname();

  if (pathname?.startsWith("/docs")) return null;
  const isCompanionMode = pathname === "/companion";
  if (isCompanionMode || pathname === "/auth/desktop-success") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 group" onMouseLeave={() => setActiveMenu(null)}>
      {/* Background that dims the page when a dropdown is open */}
      <div 
        className={`absolute inset-0 h-screen w-screen bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${activeMenu || searchOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} 
      />

      <header className={`relative transition-colors duration-300 ${searchOpen || activeMenu ? "bg-black" : "bg-transparent"}`}>
        <nav className="flex w-full items-center justify-between px-4 md:px-6 py-5">
          {/* Left Group: Logo + Nav Items */}
          <div className="flex items-center gap-16 lg:gap-24">
          <Link href="/" className="flex items-center gap-3 font-semibold text-xl tracking-tight text-white" aria-label="PawOS home">
            <Image src="/logo-icon.png" alt="" width={28} height={28} className="rounded-md" priority />
            PawOS
          </Link>

          <div className="hidden items-center md:flex h-full">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onMouseEnter={() => setActiveMenu(item.label)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeMenu === item.label ? "text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button onClick={() => { setSearchOpen(!searchOpen); setActiveMenu(null); }} className="ml-4 text-neutral-400 hover:text-white transition p-2" aria-label="Search">
                {searchOpen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                )}
              </button>
            </div>
          </div>
  
          <div className="hidden items-center gap-6 md:flex">
            
            <Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              Log in
            </Link>
            <button onClick={() => alert("PawOS for Windows is coming soon! Please check back later to be notified.")} className="text-sm font-medium text-white transition hover:opacity-80">
              Download for Windows &#8599;
            </button>
          </div>

          <button
            type="button"
            className="md:hidden text-white p-2"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen((v) => !v);
              setActiveMenu(null);
            }}
          >
            {mobileOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </nav>

        {/* Desktop Dropdown Canvas */}
        <div 
          className={`hidden md:flex absolute left-0 right-0 bg-black border-b border-neutral-900 overflow-hidden transition-all duration-300 origin-top justify-center ${
            activeMenu ? "opacity-100 max-h-[400px] py-12" : "opacity-0 max-h-0 py-0 border-b-0"
          }`}
        >
          <div className="w-full max-w-none px-4 md:px-6">
            {NAV_ITEMS.map((item) => (
              <div 
                key={item.label} 
                className={`flex gap-16 transition-opacity duration-300 ${
                  activeMenu === item.label ? "block opacity-100" : "hidden opacity-0"
                }`}
              >
                {item.dropdown.map((section) => (
                  <div key={section.title}>
                    <h3 className="text-sm font-medium text-neutral-500 mb-6 uppercase tracking-wider">{section.title}</h3>
                    <ul className="space-y-4">
                      {section.links.map((link) => (
                        <li key={link.label}>
                          <Link href={link.href} className="text-2xl font-medium text-neutral-200 hover:text-white transition" onClick={() => setActiveMenu(null)}>
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        
        {/* Search Overlay Canvas */}
        <div 
          className={`hidden md:flex absolute left-0 right-0 bg-black border-b border-neutral-900 overflow-hidden transition-all duration-300 origin-top justify-center ${
            searchOpen ? "opacity-100 max-h-[1000px] py-16" : "opacity-0 max-h-0 py-0 border-b-0"
          }`}
        >
          <div className="w-full max-w-3xl px-6 flex flex-col">
            <h2 className="text-4xl font-medium text-neutral-600 mb-8 transition-opacity duration-300">Ask about PawOS</h2>
            
            <div className="relative border-b border-neutral-800 pb-4 mb-8 group">
              <span className="absolute -top-6 left-0 text-xs font-medium text-neutral-500">Your search</span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value === "") setActiveSearchQuery("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") executeSearch(searchQuery);
                }}
                className="w-full bg-transparent text-4xl font-medium text-white placeholder-neutral-800 focus:outline-none"
                autoFocus={searchOpen}
              />
              <div onClick={() => executeSearch(searchQuery)} className="absolute right-0 top-1 text-neutral-400 bg-neutral-800 p-2 rounded-full cursor-pointer hover:bg-neutral-700 hover:text-white transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </div>
            </div>

            {!activeSearchQuery ? (
              <div className="flex flex-col gap-6">
                {recentSearches.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-4">Recent searches</h3>
                    <ul className="space-y-3">
                      {recentSearches.map((term, i) => (
                        <li key={i} className="group flex items-center justify-between">
                          <button onClick={() => executeSearch(term)} className="text-xl font-medium text-neutral-300 hover:text-white transition">
                            {term}
                          </button>
                          <button onClick={() => handleRemoveRecent(term)} className="text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 transition" aria-label="Remove recent search">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-neutral-600 text-xl font-light mt-4">
                    Search for documentation, plugins, downloads, and more...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-8 h-full overflow-y-auto pb-12">
                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-6 border-b border-neutral-900 pb-2">
                    {searchResults.length > 0 ? "Sources" : "No results found"}
                  </h3>
                  
                  <div className="space-y-8">
                    {searchResults.map((result, i) => (
                      <div key={i} className="pt-2">
                        <div className="text-sm font-medium text-neutral-400 mb-2">{result.type}</div>
                        <Link href={result.url} className="text-2xl font-medium text-white hover:underline block mb-2" onClick={() => setSearchOpen(false)}>
                          {result.title}
                        </Link>
                        <p className="text-base text-neutral-400">{result.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Full Screen Menu */}
        {mobileOpen && (
          <div className="fixed inset-0 top-[73px] bg-black z-40 overflow-y-auto px-6 py-8 md:hidden">
            <div className="flex flex-col space-y-8">
              {NAV_ITEMS.map((item) => (
                <div key={item.label}>
                  <div className="text-2xl font-medium text-white mb-4">{item.label}</div>
                  <div className="grid grid-cols-1 gap-6 pl-4 border-l border-neutral-800">
                    {item.dropdown.map((section) => (
                      <div key={section.title}>
                        <h3 className="text-sm font-medium text-neutral-500 mb-3">{section.title}</h3>
                        <ul className="space-y-3">
                          {section.links.map((link) => (
                            <li key={link.label}>
                              <Link href={link.href} className="text-lg font-medium text-neutral-300 hover:text-white" onClick={() => setMobileOpen(false)}>
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              <div className="border-t border-neutral-800 pt-8 flex flex-col gap-4">
                <button onClick={() => { alert("PawOS for Windows is coming soon! Please check back later to be notified."); setMobileOpen(false); }} className="text-xl font-medium text-white text-left">
                  Download for Windows &#8599;
                </button>
                <Link href="/login" className="text-xl font-medium text-neutral-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Log in
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

