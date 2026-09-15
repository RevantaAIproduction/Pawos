"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/companion", label: "Companion" },
      { href: "/features#autonomous-work", label: "Autonomous Work" },
      { href: "/features#projects", label: "Projects" },
      { href: "/features", label: "Features" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/pricing#individuals", label: "Individuals" },
      { href: "/enterprise", label: "Teams" },
      { href: "/enterprise", label: "Organizations" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/integrations", label: "Integrations" },
      { href: "/docs/integrations/github", label: "GitHub" },
      { href: "/docs/integrations/jira", label: "Jira" },
      { href: "/docs/integrations/linear", label: "Linear" },
    ],
  },
  {
    title: "Resources",
    links: [
      
      { href: "/faq", label: "FAQ" },
      { href: "/changelog", label: "Changelog" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About PawOS" },
      { href: "/careers", label: "Careers" },
      { href: "/about#builders", label: "Builders" },
      
      { href: "/support/contact", label: "Contact" },
      { href: "/about", label: "Revanta AI" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/docs")) return null;

  return (
    <footer className="border-t border-neutral-900 bg-black text-sm relative z-10">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid grid-cols-2 gap-x-8 gap-y-16 sm:grid-cols-3 lg:grid-cols-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-white font-semibold tracking-wide">{group.title}</h3>
              <ul className="mt-8 space-y-4">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-neutral-400 transition hover:text-white font-medium">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="mt-32 border-t border-neutral-900 pt-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="PawOS home">
              <Image src="/logo-icon.png" alt="PawOS Logo" width={32} height={32} className="rounded-lg" />
            </Link>
            <div>
              <p className="text-neutral-200 font-semibold text-base tracking-tight">PawOS</p>
              <p className="text-neutral-500">
                An AI work environment by <span className="text-neutral-300">Revanta AI</span>.
              </p>
            </div>
          </div>
          <p className="text-neutral-600">
            &copy; {new Date().getFullYear()} Revanta AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

