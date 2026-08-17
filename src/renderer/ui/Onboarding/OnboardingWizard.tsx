import React, { useEffect, useState } from 'react';
import styles from './onboardingWizard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { pairingService } from '../../mobilePresence/PairingService';
import type { AuthUser } from '../../auth/AuthTypes';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import type { PairingSessionStart } from '../../../shared/mobilePresence/MobilePresenceTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * First-run onboarding — a resumable multi-step wizard shown once after a
 * user's first successful sign-in (see AppRoot.tsx), before the dashboard.
 * Progress is persisted via OnboardingStore (main process) so quitting
 * mid-wizard resumes at the same step next launch rather than restarting.
 *
 * "Sign In / Create Account" from the approved spec is not a separate step
 * here — auth already happened before this component ever mounts (see
 * AppRoot's stage machine); this wizard only ever runs for an already
 * signed-in user, so that step is a brief confirmation instead of a
 * duplicate auth form.
 *
 * Deliberately short: plan selection, model choice, and the per-permission
 * (mic/file system/notifications) screens were removed from setup. Those
 * permissions are requested contextually — the OS/Electron permission
 * prompt fires naturally the first time the app actually calls
 * getUserMedia()/Notification.requestPermission() at the point of use
 * (e.g. starting a voice conversation) — not upfront before the user has
 * any reason to grant them. The plan/model pickers remain fully available
 * in Settings.
 */
const STEP_COUNT = 5;

export function OnboardingWizard({ user, onFinish }: { user: AuthUser; onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tier, setTier] = useState<SubscriptionTierId>('go');
  const [pairingSession, setPairingSession] = useState<PairingSessionStart | null>(null);
  const [paired, setPaired] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ipc.onboardingGet().then((state) => {
      setStep(state.step);
      setLoaded(true);
    });
    ipc.billingGetSubscription().then((s) => setTier(s.tier)).catch(() => {});
  }, []);

  const goTo = async (next: number) => {
    setStep(next);
    await ipc.onboardingSetStep(next).catch(() => {});
  };

  const next = () => goTo(Math.min(step + 1, STEP_COUNT - 1));
  const back = () => goTo(Math.max(step - 1, 0));

  const finish = async () => {
    await ipc.onboardingComplete();
    onFinish();
  };

  const canPairMobile = !user.isGuest && tier !== 'go';

  const generatePairingCode = async () => {
    if (!canPairMobile) return;
    setPairingError(null);
    setBusy(true);
    try {
      await pairingService.syncEntitlementTier();
      const result = await pairingService.beginPairing();
      setPairingSession(result);
    } catch (err) {
      setPairingError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pairingSession || user.isGuest) return;
    const unsubscribe = pairingService.subscribeToPairingCompletion(pairingSession.sessionId, user.id, () => {
      setPaired(true);
      setPairingSession(null);
    });
    return unsubscribe;
  }, [pairingSession, user.id, user.isGuest]);

  if (!loaded) return null;

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.progress}>
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <span key={i} className={i <= step ? styles.dotActive : styles.dot} />
          ))}
        </div>

        {step === 0 && (
          <section>
            <h1 className={styles.title}>Welcome to PawOS</h1>
            <p className={styles.body}>
              Let's get your desktop companion set up. This takes about a minute, and you can
              come back to any of it later in Settings.
            </p>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className={styles.title}>You're all set, {user.name}</h1>
            <p className={styles.body}>
              You're signed in with {user.isGuest ? 'a guest session' : user.provider}
              {user.email ? ` (${user.email})` : ''}. Let's finish setting up your companion.
            </p>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className={styles.title}>Meet your companion</h1>
            <p className={styles.body}>
              Paw lives as a small animated companion on your desktop — always visible, never in
              the way. Double-click it anytime to start talking. Customize its look in Companion
              Studio, or bring your own companion model entirely.
            </p>
            {canPairMobile ? (
              <>
                <p className={styles.body}>
                  Want it on your phone too? Scan this with your phone's camera to open the PawOS
                  web app and link it as a trusted device — notifications, approvals, and a live
                  preview of your conversation follow from there.
                </p>
                {paired && !pairingSession && (
                  <p className={styles.hint} style={{ color: '#7fd9a0' }}>Device paired successfully.</p>
                )}
                {pairingSession ? (
                  <div className={styles.qrRow}>
                    <img src={pairingSession.qrDataUrl} alt="Pairing QR code" className={styles.qrImage} />
                    <p className={styles.hint} style={{ wordBreak: 'break-all' }}>{pairingSession.pairingUrl}</p>
                  </div>
                ) : (
                  <button type="button" className={styles.primaryButton} onClick={generatePairingCode} disabled={busy}>
                    {busy ? 'Generating…' : 'Pair a mobile device (optional)'}
                  </button>
                )}
                {pairingError && <p className={styles.hint} style={{ color: '#e57373' }}>{pairingError}</p>}
              </>
            ) : (
              <p className={styles.hint}>
                Mobile pairing is available on paid plans — you can upgrade anytime from Settings.
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className={styles.title}>A quick tour</h1>
            <ul className={styles.tourList}>
              <li><strong>Coding Canvas</strong> — a live control center for project understanding, builds, tests, and diffs.</li>
              <li><strong>Universal Execution</strong> — Paw plans, confirms, then executes real desktop actions.</li>
              <li><strong>Communication Intelligence</strong> — meetings and calls become searchable memory.</li>
            </ul>
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className={styles.title}>You're ready</h1>
            <p className={styles.body}>That's everything — Paw is set up and ready to work with you.</p>
          </section>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.linkButton} onClick={back} disabled={step === 0}>
            Back
          </button>
          {step < STEP_COUNT - 1 ? (
            <button type="button" className={styles.primaryButton} onClick={next}>
              Continue
            </button>
          ) : (
            <button type="button" className={styles.primaryButton} onClick={finish}>
              Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
