import React, { useEffect, useState } from 'react';
import styles from './authScreen.module.css';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../../auth/validation';
import type { EmailCreateAccountOptions, EmailSignInOptions } from '../../auth/AuthTypes';
import signInCat from './assets/sign-in-cat.png';
import createAccountCat from './assets/create-account-cat.png';
import { OtpInput } from './OtpInput';
import {
  MailIcon,
  LockIcon,
  PersonIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  BoltIcon,
  CloudIcon,
  HeartIcon,
  PawIcon,
  GoogleGlyph,
  MicrosoftGlyph,
  AppleGlyph,
  GitHubGlyph,
} from './icons';

type Mode = 'signin' | 'create';
type Step = 'form' | 'verify' | 'reset-code' | 'reset-new';
const RESEND_COOLDOWN_SECONDS = 30;
const OTP_LENGTH = 6;

const COMING_SOON: { label: string; icon: React.ReactNode }[] = [
  { label: 'Microsoft', icon: <MicrosoftGlyph /> },
  { label: 'Apple', icon: <AppleGlyph /> },
  { label: 'GitHub', icon: <GitHubGlyph /> },
];

const FEATURES = [
  { icon: <ShieldCheckIcon />, title: 'Secure & Private', body: 'Your data stays yours.' },
  { icon: <BoltIcon />, title: 'Smart Automation', body: 'Work smarter, not harder.' },
  { icon: <CloudIcon />, title: 'Always in Sync', body: 'Across all your devices.' },
  { icon: <HeartIcon />, title: 'Built for You', body: 'Made with care.' },
];

export function AuthScreen({
  onSignInWithGoogle,
  onSignInWithEmail,
  onCreateEmailAccount,
  onContinueAsGuest,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
  onSendVerificationCode,
  onVerifyEmailCode,
  isGoogleSignInAvailable,
}: {
  onSignInWithGoogle: () => Promise<unknown>;
  onSignInWithEmail: (options: EmailSignInOptions) => Promise<unknown>;
  onCreateEmailAccount: (options: EmailCreateAccountOptions) => Promise<unknown>;
  onContinueAsGuest: () => Promise<unknown>;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
  onSendVerificationCode: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyEmailCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string }>;
  isGoogleSignInAvailable: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'google' | 'email' | 'guest' | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  const [otpCode, setOtpCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [codeExpiresInMinutes, setCodeExpiresInMinutes] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    isGoogleSignInAvailable().then(setGoogleAvailable);
  }, [isGoogleSignInAvailable]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const runGuarded = async (which: typeof pending, action: () => Promise<unknown>) => {
    setError(null);
    setPending(which);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleGoogle = () => runGuarded('google', onSignInWithGoogle);
  const handleGuest = () => runGuarded('guest', onContinueAsGuest);

  /** Sends (or resends) the verification code and moves to the code-entry step. Doesn't create the account yet — that only happens once the code is proven. */
  const requestVerificationCode = async () => {
    setError(null);
    setPending('email');
    try {
      const { expiresInMinutes } = await onSendVerificationCode(email);
      setCodeExpiresInMinutes(expiresInMinutes);
      setOtpCode('');
      setVerifyError(null);
      setStep('verify');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a verification code. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!isValidPassword(password)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (mode === 'create') {
      if (!name.trim()) {
        setError('Enter your name.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords don’t match.');
        return;
      }
      if (!agreedToTerms) {
        setError('Please agree to the Terms of Service and Privacy Policy.');
        return;
      }
      void requestVerificationCode();
    } else {
      void runGuarded('email', () => onSignInWithEmail({ email, password, rememberMe }));
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== OTP_LENGTH) {
      setVerifyError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setVerifyError(null);
    setPending('email');
    try {
      const result = await onVerifyEmailCode(email, otpCode);
      if (!result.valid) {
        setVerifyError(result.reason ?? 'Incorrect code.');
        return;
      }
      await onCreateEmailAccount({ name, email, password });
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleResend = () => {
    if (resendCooldown > 0 || pending) return;
    void requestVerificationCode();
  };

  const handleBackToForm = () => {
    setStep('form');
    setOtpCode('');
    setVerifyError(null);
    setResetToken(null);
  };

  const handleForgotPassword = async () => {
    if (!isValidEmail(email)) {
      setError('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    setError(null);
    setPending('email');
    try {
      const { expiresInMinutes } = await onRequestPasswordReset(email);
      setCodeExpiresInMinutes(expiresInMinutes);
      setOtpCode('');
      setVerifyError(null);
      setStep('reset-code');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset code. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleResendResetCode = () => {
    if (resendCooldown > 0 || pending) return;
    void handleForgotPassword();
  };

  const handleResetCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== OTP_LENGTH) {
      setVerifyError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setVerifyError(null);
    setPending('email');
    try {
      const result = await onVerifyPasswordResetCode(email, otpCode);
      if (!result.valid || !result.resetToken) {
        setVerifyError(result.reason ?? 'Incorrect code.');
        return;
      }
      setResetToken(result.resetToken);
      setNewPassword('');
      setConfirmNewPassword('');
      setStep('reset-new');
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPassword(newPassword)) {
      setVerifyError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setVerifyError('Passwords don’t match.');
      return;
    }
    if (!resetToken) {
      setVerifyError('Your reset session expired — start over from "Forgot password?".');
      return;
    }
    setVerifyError(null);
    setPending('email');
    try {
      const result = await onCompletePasswordReset(resetToken, newPassword);
      if (!result.ok) {
        setVerifyError(result.reason ?? 'Could not reset your password. Please try again.');
        return;
      }
      setResetDone(true);
      setResetToken(null);
      setStep('form');
      setMode('signin');
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  const switchMode = () => {
    setError(null);
    setStep('form');
    setOtpCode('');
    setVerifyError(null);
    setMode((m) => (m === 'signin' ? 'create' : 'signin'));
  };

  const busy = pending !== null;
  const verifying = mode === 'create' && step === 'verify';
  const resettingCode = step === 'reset-code';
  const resettingNew = step === 'reset-new';

  return (
    <div className={styles.screen}>
      <div className={styles.shell}>
        <div className={styles.visualPane}>
          <div className={styles.speechBubble}>
            <div className={styles.speechTitle}>
              {verifying || resettingCode
                ? 'Check your email!'
                : resettingNew
                  ? 'Almost done!'
                  : mode === 'signin'
                    ? 'Welcome back!'
                    : "Let's get started!"}
            </div>
            <div className={styles.speechBody}>
              {verifying || resettingCode
                ? `We sent a ${OTP_LENGTH}-digit code to ${email}.`
                : resettingNew
                  ? 'Choose a new password to finish resetting your account.'
                  : mode === 'signin'
                    ? "Good to see you again. Let's continue our journey."
                    : 'Create your account and unlock everything.'}
            </div>
          </div>
          <div className={styles.mascotWrap}>
            <div className={styles.mascotGlow} />
            <img
              src={mode === 'signin' ? signInCat : createAccountCat}
              alt="Paw, your PawOS companion"
              className={styles.mascotImg}
            />
          </div>
        </div>

        <div className={styles.formPane}>
          <div className={styles.brand}>
            <span className={styles.logoBox}>
              <PawIcon size={18} />
            </span>
            Paw<span className={styles.brandOs}>OS</span>
          </div>
          <p className={styles.tagline}>
            {verifying
              ? 'Verify your email'
              : resettingCode
                ? 'Reset your password'
                : resettingNew
                  ? 'Set a new password'
                  : mode === 'signin'
                    ? 'Your companion. Your workspace. Your world.'
                    : 'Create your account'}
          </p>

          {resettingCode ? (
            <form className={styles.emailForm} onSubmit={handleResetCodeSubmit}>
              <p className={styles.verifyIntro}>
                Enter the code we sent to <strong>{email}</strong>
                {codeExpiresInMinutes ? ` — it expires in ${codeExpiresInMinutes} minutes.` : '.'}
              </p>

              <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} />

              {verifyError && <p className={styles.errorText}>{verifyError}</p>}

              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {pending === 'email' ? 'Verifying…' : 'Verify Code'}
                {!busy && <ArrowRightIcon />}
              </button>

              <div className={styles.resendRow}>
                <button type="button" className={styles.linkButton} onClick={handleBackToForm} disabled={busy}>
                  Back
                </button>
                <button type="button" className={styles.linkButton} onClick={handleResendResetCode} disabled={busy || resendCooldown > 0}>
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </button>
              </div>
            </form>
          ) : resettingNew ? (
            <form className={styles.emailForm} onSubmit={handleSetNewPassword}>
              <div className={styles.inputGroup}>
                <span className={styles.inputIcon}>
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={styles.emailInput}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <div className={styles.inputGroup}>
                <span className={styles.inputIcon}>
                  <LockIcon />
                </span>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className={styles.emailInput}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {verifyError && <p className={styles.errorText}>{verifyError}</p>}

              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {pending === 'email' ? 'Saving…' : 'Set New Password'}
                {!busy && <ArrowRightIcon />}
              </button>

              <div className={styles.resendRow}>
                <button type="button" className={styles.linkButton} onClick={handleBackToForm} disabled={busy}>
                  Cancel
                </button>
              </div>
            </form>
          ) : verifying ? (
            <form className={styles.emailForm} onSubmit={handleVerifySubmit}>
              <p className={styles.verifyIntro}>
                Enter the code we sent to <strong>{email}</strong>
                {codeExpiresInMinutes ? ` — it expires in ${codeExpiresInMinutes} minutes.` : '.'}
              </p>

              <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} />

              {verifyError && <p className={styles.errorText}>{verifyError}</p>}

              <button type="submit" className={styles.primaryButton} disabled={busy}>
                {pending === 'email' ? 'Verifying…' : 'Verify & Create Account'}
                {!busy && <ArrowRightIcon />}
              </button>

              <div className={styles.resendRow}>
                <button type="button" className={styles.linkButton} onClick={handleBackToForm} disabled={busy}>
                  Back
                </button>
                <button type="button" className={styles.linkButton} onClick={handleResend} disabled={busy || resendCooldown > 0}>
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" className={styles.providerButton} onClick={handleGoogle} disabled={busy}>
                <GoogleGlyph size={18} />
                {pending === 'google' ? 'Opening Google sign-in…' : 'Continue with Google'}
              </button>
              {!googleAvailable && (
                <p className={styles.hint}>
                  Google sign-in needs a GOOGLE_CLIENT_ID configured in .env before this will work.
                </p>
              )}

              <div className={styles.divider}>
                <span />
                OR
                <span />
              </div>

              <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
                {mode === 'create' && (
                  <div className={styles.inputGroup}>
                    <span className={styles.inputIcon}>
                      <PersonIcon />
                    </span>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={styles.emailInput}
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className={styles.inputGroup}>
                  <span className={styles.inputIcon}>
                    <MailIcon />
                  </span>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.emailInput}
                    autoComplete="email"
                  />
                </div>

                <div className={styles.inputGroup}>
                  <span className={styles.inputIcon}>
                    <LockIcon />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.emailInput}
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>

                {mode === 'create' && (
                  <div className={styles.inputGroup}>
                    <span className={styles.inputIcon}>
                      <LockIcon />
                    </span>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={styles.emailInput}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                )}

                {mode === 'signin' ? (
                  <div className={styles.rowBetween}>
                    <label className={styles.checkboxLabel}>
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                      Remember me
                    </label>
                    <button type="button" className={styles.linkButton} onClick={handleForgotPassword}>
                      Forgot password?
                    </button>
                  </div>
                ) : (
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
                    <span>
                      I agree to the <span className={styles.termsAccent}>Terms of Service</span> and{' '}
                      <span className={styles.termsAccent}>Privacy Policy</span>
                    </span>
                  </label>
                )}
                {resetDone && (
                  <p className={styles.hint}>Your password was reset — sign in with your new password.</p>
                )}

                <button type="submit" className={styles.primaryButton} disabled={busy}>
                  {pending === 'email' ? 'Please wait…' : mode === 'create' ? 'Send Verification Code' : 'Sign In'}
                  {!busy && <ArrowRightIcon />}
                </button>
              </form>

              <p className={styles.switchModeText}>
                {mode === 'signin' ? (
                  <>
                    New to PawOS?{' '}
                    <button type="button" className={styles.switchModeLink} onClick={switchMode}>
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button type="button" className={styles.switchModeLink} onClick={switchMode}>
                      Sign in
                    </button>
                  </>
                )}
              </p>

              {error && <p className={styles.errorText}>{error}</p>}

              {mode === 'signin' ? (
                <>
                  <div className={styles.divider}>
                    <span />
                    Or continue as guest
                    <span />
                  </div>
                  <button type="button" className={styles.guestButton} onClick={handleGuest} disabled={busy}>
                    {pending === 'guest' ? 'Setting up…' : 'Continue as Guest'}
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.divider}>
                    <span />
                    Or sign up with
                    <span />
                  </div>
                  <div className={styles.socialRow}>
                    {COMING_SOON.map(({ label, icon }) => (
                      <button key={label} type="button" className={styles.comingSoonButton} disabled>
                        {icon}
                        <span>{label}</span>
                        <span className={styles.badge}>Coming Soon</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.featureBar}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.featureItem}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <div>
              <div className={styles.featureTitle}>{f.title}</div>
              <div className={styles.featureBody}>{f.body}</div>
            </div>
          </div>
        ))}
      </div>

      <p className={styles.copyright}>© {new Date().getFullYear()} PawOS. All rights reserved.</p>
    </div>
  );
}
