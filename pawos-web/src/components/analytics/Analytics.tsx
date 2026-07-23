"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getStoredConsent } from "./CookieConsent";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Loads Google Analytics only if BOTH a real measurement ID is configured
 * (NEXT_PUBLIC_GA_MEASUREMENT_ID) and the visitor has explicitly accepted
 * cookies — never assumed consent, never loaded unconditionally. Absent an
 * ID, this renders nothing rather than a placeholder tracking snippet.
 */
export function Analytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const sync = () => setConsented(getStoredConsent() === "accepted");
    sync();
    window.addEventListener("pawos-consent-changed", sync);
    return () => window.removeEventListener("pawos-consent-changed", sync);
  }, []);

  if (!GA_ID || !consented) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}

/** Fires a real GA event (download click, etc.) only when analytics is actually loaded. */
export function trackEvent(name: string, params?: Record<string, string | number>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("event", name, params);
}
