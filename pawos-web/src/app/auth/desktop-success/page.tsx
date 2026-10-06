"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./desktop-success.module.css";

const PawOSLogo = () => (
  <svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="12" fill="#2563EB" />
    <path d="M24 12C17.3726 12 12 17.3726 12 24C12 30.6274 17.3726 36 24 36C30.6274 36 36 30.6274 36 24C36 17.3726 30.6274 12 24 12ZM24 32C19.5817 32 16 28.4183 16 24C16 19.5817 19.5817 16 24 16C28.4183 16 32 19.5817 32 24C32 28.4183 28.4183 32 24 32Z" fill="white" />
    <circle cx="24" cy="24" r="4" fill="white" />
  </svg>
);

function DesktopSuccessPageContent() {
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider");
  const ref = searchParams.get("ref");
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const deepLink = useMemo(() => {
    if (error) return null;
    if (!provider) return null;

    // Validate provider to prevent arbitrary protocol host injection
    const allowedProviders = ["google", "github", "microsoft"];
    if (!allowedProviders.includes(provider)) return null;

    // Construct deep link explicitly based on the allowed providers
    const url = new URL(`pawos://${provider}-auth-callback`);
    if (ref) url.searchParams.set("ref", ref);
    if (code) url.searchParams.set("code", code);
    return url.toString();
  }, [provider, ref, code, error]);

  // True once PawOS has probably been opened: the user clicked the button, or this tab lost focus
  // (which is what happens when the automatic handoff below goes through). The page has no way to
  // hear back from the desktop app, so the copy says what to expect rather than claiming it worked.
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    if (!deepLink) return;
    const markHandedOff = () => setHandedOff(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") markHandedOff();
    };
    window.addEventListener("blur", markHandedOff);
    document.addEventListener("visibilitychange", onVisibility);
    // Attempt automatic handoff
    // Browsers silently ignore this when the redirect chain that led here had no user click
    // (Google/GitHub → Supabase → here), which is why the page asks for the click below.
    window.location.href = deepLink;
    return () => {
      window.removeEventListener("blur", markHandedOff);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deepLink]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <PawOSLogo />
          <h1 className={styles.title}>
            {error ? "Authentication Failed" : "Authentication Successful"}
          </h1>
        </div>

        <div className={styles.body}>
          {error ? (
            <p className={styles.errorText}>
              We couldn&apos;t sign you in: <strong>{error}</strong>
            </p>
          ) : (
            <>
              <p className={styles.successText}>You&apos;re securely signed in.</p>
              <p className={styles.hintText}>
                {handedOff
                  ? "PawOS should now be open. Once it shows you as signed in, you can close this tab."
                  : "One more step: click Open PawOS to finish signing in to the desktop app."}
              </p>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {error ? (
            <p className={styles.hintText}>You can close this tab and try again in PawOS.</p>
          ) : deepLink ? (
            <a href={deepLink} className={styles.primaryButton} onClick={() => setHandedOff(true)}>
              {handedOff ? "Open PawOS again" : "Open PawOS"}
            </a>
          ) : (
            <p className={styles.errorText}>Missing required authentication details.</p>
          )}
          {!error && deepLink && (
            <p className={styles.footnote}>
              {handedOff
                ? "Nothing happened? Click the button again and choose Open if your browser asks."
                : "If your browser asks whether to open PawOS, choose Open."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DesktopSuccessPage() {
  return (
    <React.Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading...</div>}>
      <DesktopSuccessPageContent />
    </React.Suspense>
  );
}
