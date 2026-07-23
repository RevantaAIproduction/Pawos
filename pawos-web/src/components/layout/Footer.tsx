import Link from "next/link";
import { Container } from "../ui/Container";

const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/enterprise", label: "Enterprise" },
      { href: "/download", label: "Download" },
      { href: "/changelog", label: "Changelog" },
      { href: "/roadmap", label: "Roadmap" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/knowledge-base", label: "Knowledge Base" },
      { href: "/blog", label: "Blog" },
      { href: "/faq", label: "FAQ" },
      { href: "/security", label: "Security" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/trust", label: "Trust & Transparency" },
      { href: "/support", label: "Support" },
      { href: "/support/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/security-policy", label: "Security Policy" },
      { href: "/legal", label: "All legal documents" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-neutral-950">
      <Container className="py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{group.title}</h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-neutral-400 transition hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-neutral-900 pt-8 text-sm text-neutral-500 sm:flex-row">
          <p>© {new Date().getFullYear()} PawOS. All rights reserved.</p>
          <p>Built for people who want their desktop to do more.</p>
        </div>
      </Container>
    </footer>
  );
}
