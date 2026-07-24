"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../ui/Button";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/enterprise", label: "Enterprise" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
];

export function Nav({ userEmail }: { userEmail: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-lg" aria-label="PawOS home">
          <Image src="/logo-icon.png" alt="" width={32} height={32} className="rounded-lg" priority />
          Paw<span className="text-blue-400">OS</span>
        </Link>

        <div className="hidden items-center gap-6 text-sm text-neutral-300 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {userEmail ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-900"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold">
                {userEmail.slice(0, 1).toUpperCase()}
              </span>
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-sm text-neutral-300 transition hover:text-white">
              Log in
            </Link>
          )}
          <Button href="/download" variant="primary" className="px-5 py-2">
            Download
          </Button>
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-neutral-300 hover:bg-neutral-900 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </nav>

      {open && (
        <div className="border-t border-neutral-800 bg-neutral-950 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4 text-sm text-neutral-300">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-white" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            {userEmail ? (
              <Link href="/dashboard" className="hover:text-white" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="hover:text-white" onClick={() => setOpen(false)}>
                Log in
              </Link>
            )}
            <Button href="/download" variant="primary" className="mt-2 w-full">
              Download
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
