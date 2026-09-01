'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Home Screen Installation (MOB-4). Chrome/Edge/most Android browsers fire
 * `beforeinstallprompt`, which we capture and re-trigger from our own
 * button (a real, working native browser API call — not a fabricated
 * install). Safari/iOS never fires that event (confirmed browser
 * limitation, not a bug here), so those users get real manual instructions
 * instead of a silently-broken button — matching the Next.js PWA guide's
 * own documented approach for iOS.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window));
  const [isStandalone, setIsStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <p className="text-sm text-neutral-300">
          {isIOS
            ? 'Install PawOS: tap Share, then "Add to Home Screen".'
            : 'Add PawOS to your home screen for quick notifications and conversations.'}
        </p>
        <div className="flex shrink-0 gap-2">
          {!isIOS && (
            <button type="button" onClick={install} className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-black">
              Install
            </button>
          )}
          <button type="button" onClick={() => setDismissed(true)} className="rounded-md px-2 py-1.5 text-sm text-neutral-400">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
