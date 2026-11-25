"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAuthPagePath } from "../auth/AuthLayout";

const GROUPS = [
  {
    title: "Product",
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
    title: "Solutions",
    links: [
      { href: "/pricing#individual-plans", label: "Individual Developers" },
      { href: "/enterprise", label: "Engineering Teams" },
      { href: "/features/autonomous-engineering", label: "Engineering Workflows" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/getting-started/four-ways-to-work#install-cli", label: "Install the CLI" },
      { href: "/docs/getting-started/four-ways-to-work", label: "Choose your workflow" },
      { href: "/docs/connectors/overview", label: "Integrations" },
      { href: "/docs/coding/overview", label: "Coding & validation guides" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/about", label: "About PawOS" },
      { href: "/changelog", label: "Changelog" },
      { href: "/faq", label: "FAQ" },
      { href: "/docs", label: "Documentation" },
      { href: "/support/contact", label: "Support & contact" },
      { href: "/careers", label: "Careers" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/security", label: "Privacy & Security" },
      { href: "/legal/privacy-policy", label: "Privacy Policy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/docs") || pathname?.startsWith("/dashboard") || pathname === "/app" || pathname?.startsWith("/app/") || pathname?.startsWith("/chronicle") || pathname === "/auth/desktop-success" || isAuthPagePath(pathname)) return null;

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
                AI engineering execution by <span className="text-neutral-300">Revanta AI</span>.
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

