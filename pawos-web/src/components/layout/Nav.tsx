"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

export function Nav({ userEmail }: { userEmail: string | null }) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (pathname?.startsWith("/docs")) return null;

  return (
    <div className="sticky top-0 z-50 group" onMouseLeave={() => setActiveMenu(null)}>
      {/* Background that dims the page when a dropdown is open */}
      <div 
        className={`absolute inset-0 h-screen w-screen bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${activeMenu ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} 
      />

      <header className="relative transition-colors duration-300 bg-transparent">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
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
          </div>

          
          <div className="hidden items-center gap-6 md:flex">
            <button className="text-sm font-medium text-neutral-400 hover:text-white transition" onClick={() => alert("Search functionality coming soon")}>
              Search
            </button>
            <Link href="/login" className="text-sm font-medium text-neutral-400 hover:text-white transition">
              Log in
            </Link>
            <Link href="https://revantaai.com/downloads/pawos-windows.exe" className="text-sm font-medium text-white transition hover:opacity-80">
              Download for Windows &#8599;
            </Link>
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
          <div className="w-full max-w-7xl px-6">
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
                <Link href="https://revantaai.com/downloads/pawos-windows.exe" className="text-xl font-medium text-white" onClick={() => setMobileOpen(false)}>
                  Download for Windows &#8599;
                </Link>
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

