import React, { useEffect, useState } from 'react';
import styles from './authScreen.module.css';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../../auth/validation';
import type { EmailCreateAccountOptions, EmailSignInOptions } from '../../auth/AuthTypes';
import { OtpInput } from './OtpInput';
import { Toggle } from '../Dashboard/Toggle';
import { EyeIcon, EyeOffIcon, PawIcon, GoogleGlyph, GitHubGlyph } from './icons';

type Mode = 'signin' | 'create';
type Step = 'form' | 'verify' | 'reset-code' | 'reset-new';
const RESEND_COOLDOWN_SECONDS = 30;
const OTP_LENGTH = 6;


export function AuthScreen({
  onSignInWithGoogle,
  onSignInWithGithub,
  onSignInWithEmail,
  onCreateEmailAccount,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
  onSendVerificationCode,
  onVerifyEmailCode,
  isGoogleSignInAvailable,
  isGithubSignInAvailable,
}: {
  onSignInWithGoogle: () => Promise<unknown>;
  onSignInWithGithub: () => Promise<unknown>;
  onSignInWithEmail: (options: EmailSignInOptions) => Promise<unknown>;
  onCreateEmailAccount: (options: EmailCreateAccountOptions) => Promise<unknown>;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
  onSendVerificationCode: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyEmailCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string }>;
  isGoogleSignInAvailable: () => Promise<boolean>;
  isGithubSignInAvailable: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  /** Email first ("Continue"), then the password — like PawOS Web. */
  const [emailStep, setEmailStep] = useState<'email' | 'password'>('email');
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'google' | 'github' | 'email' | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(true);
  const [githubAvailable, setGithubAvailable] = useState(true);

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
    isGithubSignInAvailable().then(setGithubAvailable);
  }, [isGithubSignInAvailable]);

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
  const handleGithub = () => runGuarded('github', onSignInWithGithub);

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

  /** Step one: the email (and the name, when creating an account). */
  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && !firstName.trim()) {
      setError('Enter your first name.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    // Creating an account: verify the email with a 6-digit code before choosing a password.
    if (mode === 'create') void requestVerificationCode();
    else setEmailStep('password');
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
      if (!firstName.trim()) {
        setError('Enter your first name.');
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don’t match.");
        return;
      }
      if (!agreedToTerms || !agreedToPrivacy) {
        setError("Please accept both the Terms of Service and Privacy Policy.");
        return;
      }
      // The email was verified in the previous step.
      void runGuarded('email', () => onCreateEmailAccount({ name, email, password }));
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
      // Email verified — now choose the password.
      setStep('form');
      setEmailStep('password');
      setOtpCode('');
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
    setEmailStep('email');
    setPassword('');
    setConfirmPassword('');
  };

  const busy = pending !== null;
  const verifying = mode === 'create' && step === 'verify';
  const resettingCode = step === 'reset-code';
  const resettingNew = step === 'reset-new';

  const [title, subtitle] = verifying
    ? ['Check your email', `We sent a ${OTP_LENGTH}-digit code to ${email}`]
    : resettingCode
      ? ['Reset your password', `We sent a ${OTP_LENGTH}-digit code to ${email}`]
      : resettingNew
        ? ['Set a new password', 'Almost done']
        : mode === 'signin'
          ? ['Welcome back to PawOS', 'Pick up where you left off']
          : emailStep === 'password'
            ? ['Choose a password', 'Your email is verified']
            : ['Welcome to PawOS', 'One account for Desktop and Web'];

  const passwordField = (
    value: string,
    onChange: (value: string) => void,
    shown: boolean,
    toggle: () => void,
    { id, label, placeholder, autoComplete, autoFocus }: { id: string; label: string; placeholder: string; autoComplete: string; autoFocus?: boolean }
  ) => (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.input}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <button type="button" className={styles.passwordToggle} onClick={toggle} aria-label={shown ? 'Hide password' : 'Show password'}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );

  const emailChip = (
    <div className={styles.emailChip}>
      <span className={styles.emailChipText}>{email}</span>
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => {
          setError(null);
          setPassword('');
          setConfirmPassword('');
          setEmailStep('email');
        }}
        disabled={busy}
      >
        Change
      </button>
    </div>
  );

  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <span className={styles.logoBox}>
          <PawIcon size={16} />
        </span>
        PawOS
      </div>

      <main className={styles.column}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>

        {resettingCode ? (
          <form className={styles.form} onSubmit={handleResetCodeSubmit}>
            <p className={styles.verifyIntro}>
              Enter the code we sent to <strong>{email}</strong>
              {codeExpiresInMinutes ? ` — it expires in ${codeExpiresInMinutes} minutes.` : '.'}
            </p>
            <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} />
            {verifyError && <p className={styles.errorText}>{verifyError}</p>}
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {pending === 'email' ? 'Verifying…' : 'Verify code'}
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
          <form className={styles.form} onSubmit={handleSetNewPassword}>
            {passwordField(newPassword, setNewPassword, showPassword, () => setShowPassword((v) => !v), {
              id: 'new-password',
              label: 'New password',
              placeholder: `At least ${MIN_PASSWORD_LENGTH} characters`,
              autoComplete: 'new-password',
              autoFocus: true,
            })}
            {passwordField(confirmNewPassword, setConfirmNewPassword, showConfirmPassword, () => setShowConfirmPassword((v) => !v), {
              id: 'confirm-new-password',
              label: 'Confirm new password',
              placeholder: 'Type it again',
              autoComplete: 'new-password',
            })}
            {verifyError && <p className={styles.errorText}>{verifyError}</p>}
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {pending === 'email' ? 'Saving…' : 'Set new password'}
            </button>
            <div className={styles.resendRow}>
              <button type="button" className={styles.linkButton} onClick={handleBackToForm} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        ) : verifying ? (
          <form className={styles.form} onSubmit={handleVerifySubmit}>
            <p className={styles.verifyIntro}>
              Enter the code to verify your email
              {codeExpiresInMinutes ? ` — it expires in ${codeExpiresInMinutes} minutes.` : '.'}
            </p>
            <OtpInput value={otpCode} onChange={setOtpCode} disabled={busy} />
            {verifyError && <p className={styles.errorText}>{verifyError}</p>}
            <button type="submit" className={styles.primaryButton} disabled={busy}>
              {pending === 'email' ? 'Verifying…' : 'Verify email'}
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
{emailStep === 'email' && (
              <>
            <div className={styles.providerRow}>
              <button
                type="button"
                className={styles.providerButton}
                onClick={handleGoogle}
                disabled={busy}
                aria-label="Continue with Google"
                title={googleAvailable ? 'Continue with Google' : 'Google sign-in isn’t configured on this build'}
              >
                {pending === 'google' ? <span className={styles.spinner} aria-hidden="true" /> : <GoogleGlyph size={18} />}
              </button>
              <button
                type="button"
                className={styles.providerButton}
                onClick={handleGithub}
                disabled={busy}
                aria-label="Continue with GitHub"
                title={githubAvailable ? 'Continue with GitHub' : 'GitHub sign-in isn’t configured on this build'}
              >
                {pending === 'github' ? <span className={styles.spinner} aria-hidden="true" /> : <GitHubGlyph size={18} />}
              </button>
            </div>
            {(pending === 'google' || pending === 'github') && <p className={styles.hint}>Finish signing in in your browser.</p>}
              </>
            )}

            {emailStep === 'email' ? (
              <form className={styles.form} onSubmit={handleContinue}>
                {mode === 'create' && (
                  <div className={styles.nameRow}>
                    <div className={styles.field}>
                      <label htmlFor="first-name" className={styles.label}>
                        First name
                      </label>
                      <input
                        id="first-name"
                        type="text"
                        placeholder="Your first name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={styles.input}
                        autoComplete="given-name"
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="last-name" className={styles.label}>
                        Last name
                      </label>
                      <input
                        id="last-name"
                        type="text"
                        placeholder="Your last name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={styles.input}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                )}
                <div className={styles.field}>
                  <label htmlFor="email" className={styles.label}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={styles.input}
                    autoComplete="email"
                  />
                </div>
                {error && <p className={styles.errorText}>{error}</p>}
                <button type="submit" className={styles.primaryButton} disabled={busy}>
                  {pending === 'email' ? 'Sending code…' : mode === 'signin' ? 'Continue with email' : 'Continue'}
                </button>
              </form>
            ) : (
              <form className={styles.form} onSubmit={handleEmailSubmit}>
                {emailChip}
                {passwordField(password, setPassword, showPassword, () => setShowPassword((v) => !v), {
                  id: 'password',
                  label: 'Password',
                  placeholder: mode === 'create' ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password',
                  autoComplete: mode === 'create' ? 'new-password' : 'current-password',
                  autoFocus: true,
                })}
                {mode === 'create' &&
                  passwordField(confirmPassword, setConfirmPassword, showConfirmPassword, () => setShowConfirmPassword((v) => !v), {
                    id: 'confirm-password',
                    label: 'Confirm password',
                    placeholder: 'Type it again',
                    autoComplete: 'new-password',
                  })}

                {mode === 'signin' ? (
                  <div className={styles.rowBetween}>
                    <label className={styles.checkboxLabel}>
                      <Toggle size="sm" checked={rememberMe} onChange={setRememberMe} />
                      Remember me
                    </label>
                    <button type="button" className={styles.linkButton} onClick={handleForgotPassword} disabled={busy}>
                      Forgot password?
                    </button>
                  </div>
                ) : (
                  <div className={styles.legal}>
                    <label className={styles.checkboxLabel}>
                      <Toggle size="sm" checked={agreedToTerms} onChange={setAgreedToTerms} />
                      <span>
                        I agree to the{' '}
                        <button type="button" className={styles.inlineLink} onClick={() => window.open('https://pawos.revantaai.com/terms', '_blank')}>
                          Terms of Service
                        </button>
                      </span>
                    </label>
                    <label className={styles.checkboxLabel}>
                      <Toggle size="sm" checked={agreedToPrivacy} onChange={setAgreedToPrivacy} />
                      <span>
                        I acknowledge the{' '}
                        <button type="button" className={styles.inlineLink} onClick={() => window.open('https://pawos.revantaai.com/privacy', '_blank')}>
                          Privacy Policy
                        </button>
                      </span>
                    </label>
                  </div>
                )}
                {resetDone && <p className={styles.hint}>Your password was reset — log in with your new password.</p>}
                {error && <p className={styles.errorText}>{error}</p>}
                <button type="submit" className={styles.primaryButton} disabled={busy || (mode === 'create' && (!agreedToTerms || !agreedToPrivacy))}>
                  {pending === 'email' ? 'Please wait…' : mode === 'create' ? 'Create account' : 'Log in'}
                </button>
              </form>
            )}


            <p className={styles.switchModeText}>
              {mode === 'signin' ? 'Don’t have an account?' : 'Already have an account?'}{' '}
              <button type="button" className={styles.switchModeLink} onClick={switchMode} disabled={busy}>
                {mode === 'signin' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </>
        )}
      </main>

      <p className={styles.footer}>
        <button type="button" className={styles.inlineLink} onClick={() => window.open('https://pawos.revantaai.com/terms', '_blank')}>
          Terms of Service
        </button>{' '}
        and{' '}
        <button type="button" className={styles.inlineLink} onClick={() => window.open('https://pawos.revantaai.com/privacy', '_blank')}>
          Privacy Policy
        </button>
      </p>
    </div>
  );
}
