import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "../components/layout/Nav";
import { Footer } from "../components/layout/Footer";
import { Analytics } from "../components/analytics/Analytics";
import { CookieConsent } from "../components/analytics/CookieConsent";
import { SiteCompanion } from "../components/site-companion/SiteCompanion";
import { createClient } from "../lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://pawos.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PawOS — Your AI desktop companion",
    template: "%s — PawOS",
  },
  description:
    "PawOS is an AI companion that lives on your desktop, plans and executes real work, and helps you code, browse, deploy, and communicate — with autonomous engineering built in.",
  openGraph: {
    type: "website",
    siteName: "PawOS",
    title: "PawOS — Your AI desktop companion",
    description:
      "PawOS is an AI companion that lives on your desktop, plans and executes real work, and helps you code, browse, deploy, and communicate.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "PawOS — Your AI desktop companion",
    description:
      "PawOS is an AI companion that lives on your desktop, plans and executes real work, and helps you code, browse, deploy, and communicate.",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let userEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch {
    // Supabase not configured (e.g. local dev without env vars) — Nav just
    // renders signed-out.
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PawOS",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    description:
      "PawOS is an AI companion that lives on your desktop, plans and executes real work, and helps you code, browse, deploy, and communicate.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Paw Go — free tier",
    },
    url: SITE_URL,
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-blue-500 focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <Nav userEmail={userEmail} />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        <CookieConsent />
        <Analytics />
        <SiteCompanion />
      </body>
    </html>
  );
}
