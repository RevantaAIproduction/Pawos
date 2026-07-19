import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PawOS — Your AI desktop companion",
  description: "PawOS is an AI companion that lives on your desktop, plans and executes real work, and helps you code, browse, and communicate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold text-lg">
              Paw<span className="text-blue-400">OS</span>
            </Link>
            <div className="flex gap-6 text-sm text-neutral-300">
              <Link href="/pricing" className="hover:text-white">Pricing</Link>
              <Link href="/docs" className="hover:text-white">Docs</Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 py-8 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} PawOS. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
