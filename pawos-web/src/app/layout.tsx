import type { Metadata, Viewport } from "next";
import { OFFICIAL_SITE_ORIGIN } from "../lib/siteOrigin";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "../components/layout/Nav";
import { Footer } from "../components/layout/Footer";
import { Analytics } from "../components/analytics/Analytics";
import { CookieConsent } from "../components/analytics/CookieConsent";
import { createClient } from "../lib/supabase/server";
import { THEME_INIT_SCRIPT } from "../components/layout/themeScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = OFFICIAL_SITE_ORIGIN;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PawOS — AI engineering execution",
    template: "%s - PawOS",
  },
  description:
    "PawOS helps developers investigate issues, understand projects, plan code changes and carry out supported engineering tasks through Web, CLI and Windows Desktop.",
  openGraph: {
    type: "website",
    siteName: "PawOS",
    title: "PawOS — AI engineering execution",
    description:
      "Investigate issues, plan code changes and carry out supported engineering tasks with PawOS Web, CLI and Windows Desktop. Each experience has distinct execution boundaries.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "PawOS — AI tools for engineering work",
    description:
      "Plan and carry out supported engineering tasks with PawOS Desktop for Windows, CLI for local project folders, or Web for browser chat and GitHub-connected work.",
  },
  robots: { index: true, follow: true },
};

// Mobile Presence PWA Foundation (MOB-4) - themeColor matches manifest.ts's
// background_color/theme_color; viewportFit: 'cover' plus the safe-area
// CSS in globals.css is what lets /companion sit correctly behind a real
// phone's notch/home-indicator instead of clipping under it.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
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
    // Supabase not configured (e.g. local dev without env vars) - Nav just
    // renders signed-out.
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PawOS",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows",
    description:
      "PawOS helps developers plan and carry out supported engineering tasks through a Windows desktop app, local-project CLI, and browser-based Web experience.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Paw Go - free tier",
    },
    url: SITE_URL,
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // data-theme is set before paint by THEME_INIT_SCRIPT from the visitor's saved choice.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-black text-neutral-100">
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
        
        
        
        
      </body>
    </html>
  );
}

