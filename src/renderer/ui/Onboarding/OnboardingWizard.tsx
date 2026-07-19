import React, { useEffect, useState } from 'react';
import styles from './onboardingWizard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { aiProviderConfigStore } from '../../ai/AIProviderConfigStore';
import type { AuthUser } from '../../auth/AuthTypes';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';

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
 */
const STEP_COUNT = 15;

const MODEL_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: '', label: 'Auto', description: "Let Paw choose the right model for each task." },
  { id: 'gemini-flash-lite-latest', label: 'Paw Swift', description: 'Fastest responses, lighter reasoning.' },
  { id: 'gemini-flash-latest', label: 'Paw Flash', description: 'Balanced speed and capability — the default.' },
  { id: 'gemini-pro-latest', label: 'Paw Core', description: 'Deepest reasoning for hard problems, slower.' },
];

export function OnboardingWizard({ user, onFinish }: { user: AuthUser; onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tier, setTier] = useState<SubscriptionTierId>('go');
  const [model, setModel] = useState('');
  const [micStatus, setMicStatus] = useState<'unrequested' | 'granted' | 'denied'>('unrequested');
  const [notifStatus, setNotifStatus] = useState<'unrequested' | 'granted' | 'denied'>('unrequested');
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [qr, setQr] = useState<{ qrDataUrl: string; pairingUri: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ipc.onboardingGet().then((state) => {
      setStep(state.step);
      setWorkspacePath(state.defaultWorkspacePath);
      setLoaded(true);
    });
    ipc.billingGetSubscription().then((s) => setTier(s.tier)).catch(() => {});
    setModel(aiProviderConfigStore.get().models.gemini ?? '');
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

  const chooseTier = async (t: SubscriptionTierId) => {
    setBusy(true);
    try {
      const result = await ipc.billingSetSubscriptionTier(t);
      setTier(result.tier);
    } finally {
      setBusy(false);
    }
  };

  const chooseModel = (id: string) => {
    setModel(id);
    if (id) aiProviderConfigStore.setModel('gemini', id);
  };

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
    }
  };

  const requestNotifications = async () => {
    try {
      const result = await Notification.requestPermission();
      setNotifStatus(result === 'granted' ? 'granted' : 'denied');
    } catch {
      setNotifStatus('denied');
    }
  };

  const pickWorkspace = async () => {
    setBusy(true);
    try {
      const state = await ipc.onboardingSelectWorkspaceFolder();
      setWorkspacePath(state.defaultWorkspacePath);
    } finally {
      setBusy(false);
    }
  };

  const generatePairingCode = async () => {
    setBusy(true);
    try {
      const result = await ipc.pairingBegin(user.isGuest ? undefined : user.id);
      setQr({ qrDataUrl: result.qrDataUrl, pairingUri: result.pairingUri });
    } finally {
      setBusy(false);
    }
  };

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
              Let's get your desktop companion set up. This takes about two minutes, and you can
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
            <h1 className={styles.title}>Choose your mode</h1>
            <p className={styles.body}>
              Paw Go is planning &amp; analysis only. Paw Pro unlocks full code generation, terminal
              execution, and build/test automation. This is just a local preference — no payment is
              taken, and you can change it anytime in Settings.
            </p>
            <div className={styles.optionRow}>
              <button
                type="button"
                className={tier === 'go' ? styles.optionActive : styles.option}
                onClick={() => chooseTier('go')}
                disabled={busy}
              >
                Paw Go
              </button>
              <button
                type="button"
                className={tier === 'pro' ? styles.optionActive : styles.option}
                onClick={() => chooseTier('pro')}
                disabled={busy}
              >
                Paw Pro
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className={styles.title}>Pick a reasoning speed</h1>
            <p className={styles.body}>Auto is recommended — Paw will pick the right depth for each task automatically.</p>
            <div className={styles.stack}>
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id || 'auto'}
                  type="button"
                  className={model === m.id ? styles.optionActive : styles.option}
                  onClick={() => chooseModel(m.id)}
                >
                  <strong>{m.label}</strong>
                  <span className={styles.optionDesc}>{m.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className={styles.title}>Privacy &amp; permissions</h1>
            <p className={styles.body}>
              Paw runs entirely on this device. The next few steps ask for the access it needs to
              actually help you — you can always revoke any of it later in Settings.
            </p>
          </section>
        )}

        {step === 5 && (
          <section>
            <h1 className={styles.title}>Workspace access</h1>
            <p className={styles.body}>
              Paw reads and writes files only inside projects you point it at — never your whole
              filesystem — and always narrates what it's about to change before doing it.
            </p>
          </section>
        )}

        {step === 6 && (
          <section>
            <h1 className={styles.title}>Browser automation</h1>
            <p className={styles.body}>
              Paw can open, read, and act in a real browser on your behalf for research, forms, and
              testing your own projects — always confirming before anything irreversible.
            </p>
          </section>
        )}

        {step === 7 && (
          <section>
            <h1 className={styles.title}>Microphone access</h1>
            <p className={styles.body}>
              Needed for voice conversations and meeting capture. You can skip this and type instead.
            </p>
            <button type="button" className={styles.primaryButton} onClick={requestMic} disabled={micStatus === 'granted'}>
              {micStatus === 'granted' ? 'Microphone access granted' : micStatus === 'denied' ? 'Try again' : 'Allow microphone'}
            </button>
            {micStatus === 'denied' && <p className={styles.hint}>Access was denied — you can enable it later in your OS settings.</p>}
          </section>
        )}

        {step === 8 && (
          <section>
            <h1 className={styles.title}>File system access</h1>
            <p className={styles.body}>
              Paw can read, create, and edit files in projects you choose, and asks for confirmation
              before overwriting or deleting anything.
            </p>
          </section>
        )}

        {step === 9 && (
          <section>
            <h1 className={styles.title}>Notifications</h1>
            <p className={styles.body}>Get notified when a long-running task finishes while you're doing something else.</p>
            <button type="button" className={styles.primaryButton} onClick={requestNotifications} disabled={notifStatus === 'granted'}>
              {notifStatus === 'granted' ? 'Notifications enabled' : notifStatus === 'denied' ? 'Try again' : 'Enable notifications'}
            </button>
            {notifStatus === 'denied' && <p className={styles.hint}>Notifications were denied — you can enable them later in your OS settings.</p>}
          </section>
        )}

        {step === 10 && (
          <section>
            <h1 className={styles.title}>Default project</h1>
            <p className={styles.body}>Pick a folder Paw should treat as your default workspace for coding tasks (optional).</p>
            <button type="button" className={styles.primaryButton} onClick={pickWorkspace} disabled={busy}>
              {workspacePath ? 'Change folder' : 'Choose a folder'}
            </button>
            {workspacePath && <p className={styles.hint}>{workspacePath}</p>}
          </section>
        )}

        {step === 11 && (
          <section>
            <h1 className={styles.title}>Meet your companion</h1>
            <p className={styles.body}>
              Paw lives as a small animated companion on your desktop — always visible, never in the
              way. Double-click it anytime to start talking. You can customize its look later in
              Companion Studio.
            </p>
          </section>
        )}

        {step === 12 && (
          <section>
            <h1 className={styles.title}>Pair a mobile device (optional)</h1>
            <p className={styles.body}>
              Scan this from a future PawOS mobile companion app to link it to your account — no
              mobile app exists yet, but this generates a real pairing code ready for one.
            </p>
            {qr ? (
              <div className={styles.qrRow}>
                <img src={qr.qrDataUrl} alt="Pairing QR code" className={styles.qrImage} />
                <p className={styles.hint} style={{ wordBreak: 'break-all' }}>{qr.pairingUri}</p>
              </div>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={generatePairingCode} disabled={busy}>
                Generate pairing code
              </button>
            )}
          </section>
        )}

        {step === 13 && (
          <section>
            <h1 className={styles.title}>A quick tour</h1>
            <ul className={styles.tourList}>
              <li><strong>Coding Canvas</strong> — a live control center for project understanding, builds, tests, and diffs.</li>
              <li><strong>Universal Execution</strong> — Paw plans, confirms, then executes real desktop actions.</li>
              <li><strong>Communication Intelligence</strong> — meetings and calls become searchable memory.</li>
            </ul>
          </section>
        )}

        {step === 14 && (
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
